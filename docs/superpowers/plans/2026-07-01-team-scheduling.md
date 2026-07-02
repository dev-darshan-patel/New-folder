# Team Scheduling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a BUSINESS-plan business owner add team members and offer event types handled by round-robin or collective assignment instead of just themselves.

**Architecture:** New `TeamMember`/`EventTypeMember` models + `AssignmentMode` enum (additive migration). A new `src/lib/team.ts` owns "who's busy / who's fairest"; `src/lib/availability.ts` gains a parallel `getTeamSlotsForDate` next to the untouched solo `getSlotsForDate`. Booking write-time logic extends the existing solo overlap re-check pattern rather than replacing it.

**Tech Stack:** Next.js 16 App Router (server actions, no REST layer), Prisma 6 + SQLite, TypeScript. No test runner exists in this repo — verification is `npx tsc --noEmit`, `npm run lint`, `npm run build`, and manual exercise via the dev server (PowerShell `Invoke-WebRequest` for actions, browser for UI), matching this project's established convention.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-01-team-scheduling-design.md` — every task below implements one section of it.
- Team scheduling is **BUSINESS plan only**, enforced server-side in every action (`planConfig(user.plan).teamScheduling`), not just hidden in the UI.
- Team members have **no login** — pure resources managed by the owner.
- No customer-facing "pick your person" UI — assignment is automatic.
- The owner's `isOwner` `TeamMember` record can never be hard-deleted, only toggled active/inactive.
- Migrations must be additive (nullable fields / defaults / new tables only) so `npx prisma migrate dev --name <name>` runs non-interactively, matching every prior migration in `prisma/migrations/`.
- Ownership is always re-checked via `where: { ..., userId: user.id }` in every action — never trust a client-supplied id alone.
- Existing SOLO behavior (current `getSlotsForDate`, `createBookingAction` for SOLO event types) must remain byte-for-byte unchanged.

---

### Task 1: Schema migration — TeamMember, EventTypeMember, AssignmentMode

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: `TeamMember` model (`id, userId, name, email, isOwner, active, lastAssignedAt, createdAt`), `EventTypeMember` model (`eventTypeId, teamMemberId`), `AssignmentMode` enum (`SOLO | ROUND_ROBIN | COLLECTIVE`), `EventType.assignmentMode`, `EventType.members EventTypeMember[]`, `Availability.teamMemberId String?`, `Booking.teamMemberId String?`.

- [ ] **Step 1: Add the new models/enum and field additions**

In `prisma/schema.prisma`, add after the `User` model's relations block (right before `enum AdminRole`), keep everything else in the file unchanged:

```prisma
enum AssignmentMode {
  SOLO
  ROUND_ROBIN
  COLLECTIVE
}

// A bookable person within a tenant's business. No login — managed entirely
// by the owner. `isOwner` marks the auto-created record representing the
// account holder themselves (never hard-deleted, only toggled active).
model TeamMember {
  id             String    @id @default(cuid())
  userId         String
  user           User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  name           String
  email          String?
  isOwner        Boolean   @default(false)
  active         Boolean   @default(true)
  // Round-robin fairness cursor: oldest/null wins the next assignment among
  // those free for a given slot.
  lastAssignedAt DateTime?
  createdAt      DateTime  @default(now())

  availability   Availability[]
  eventTypes     EventTypeMember[]
  bookings       Booking[]

  @@index([userId])
}

// The pool of eligible members for a non-SOLO event type.
model EventTypeMember {
  eventTypeId  String
  eventType    EventType  @relation(fields: [eventTypeId], references: [id], onDelete: Cascade)
  teamMemberId String
  teamMember   TeamMember @relation(fields: [teamMemberId], references: [id], onDelete: Cascade)

  @@id([eventTypeId, teamMemberId])
}
```

Then modify the `EventType` model: add one field and one relation inside its existing body (after `active Boolean @default(true)`):

```prisma
  assignmentMode  AssignmentMode @default(SOLO)
```

and after the existing `bookings Booking[]` line inside `EventType`:

```prisma
  members         EventTypeMember[]
```

Then modify the `Availability` model: add after `userId`/`user` lines:

```prisma
  // null = the business/owner's own legacy hours. Non-null = that specific
  // team member's own hours.
  teamMemberId String?
  teamMember   TeamMember? @relation(fields: [teamMemberId], references: [id], onDelete: Cascade)
```

Then modify the `Booking` model: add after `eventTypeId`/`eventType` lines:

```prisma
  // Set only for ROUND_ROBIN assignments. Null for SOLO (unchanged) and
  // COLLECTIVE (pool is implied by the event type, not stored per booking).
  teamMemberId String?
  teamMember   TeamMember? @relation(fields: [teamMemberId], references: [id], onDelete: SetNull)
```

- [ ] **Step 2: Run the migration**

Stop the dev server if it's running (Windows file-locks the Prisma DLL), then run:

```bash
npx prisma migrate dev --name team_scheduling
```

Expected: a new folder appears under `prisma/migrations/` (timestamp + `_team_scheduling`), output ends with `Your database is now in sync with your schema.` and no interactive prompt (every change is additive — new tables, nullable fields, a defaulted enum field).

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors (the schema change alone shouldn't affect any existing `.ts` file since all new relations are optional/additive).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "Add TeamMember/EventTypeMember models and assignment-mode fields"
```

---

### Task 2: Plan gating — `teamScheduling` flag

**Files:**
- Modify: `src/lib/plans.ts:1-56`

**Interfaces:**
- Produces: `PlanConfig.teamScheduling: boolean`, used by every team action in later tasks via `planConfig(user.plan).teamScheduling`.

- [ ] **Step 1: Add the field to the type and each plan**

In `src/lib/plans.ts`, add to the `PlanConfig` type (after `customBranding: boolean;`):

```typescript
  // Whether team members + round-robin/collective event types are allowed.
  teamScheduling: boolean;
```

Add `teamScheduling: false,` to the `FREE` and `PRO` entries (after their `customBranding` line), and `teamScheduling: true,` to the `BUSINESS` entry. Also update the `BUSINESS.features` array, changing:

```typescript
      "Team scheduling (coming soon)",
```

to:

```typescript
      "Team scheduling (round-robin & collective)",
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/plans.ts
git commit -m "Add teamScheduling plan flag, gated to BUSINESS"
```

---

### Task 3: `src/lib/team.ts` — busy-window computation and fairness picking

**Files:**
- Create: `src/lib/team.ts`

**Interfaces:**
- Consumes: `prisma` from `@/lib/prisma`.
- Produces: `getTeamMemberBusyWindows(teamMemberId, dayStartUtc, dayEndUtc): Promise<{start: Date; end: Date}[]>`, `isFreeAt(busy, start, end): boolean`, `pickRoundRobinMember<T extends {id: string; lastAssignedAt: Date | null}>(candidates: T[], freeIds: Set<string>): T | null`, `ensureOwnerTeamMember(userId: string, ownerName: string): Promise<{id: string}>` — all consumed by Task 4 (slot generation) and Task 9 (booking write path).

- [ ] **Step 1: Write the file**

```typescript
import "server-only";
import { prisma } from "@/lib/prisma";

export type BusyWindow = { start: Date; end: Date };

// Where a team member is already committed, regardless of which event type
// caused it — a person can't double-book across SOLO/ROUND_ROBIN/COLLECTIVE.
export async function getTeamMemberBusyWindows(
  teamMemberId: string,
  dayStartUtc: Date,
  dayEndUtc: Date,
): Promise<BusyWindow[]> {
  const member = await prisma.teamMember.findUnique({
    where: { id: teamMemberId },
    select: { userId: true, isOwner: true },
  });
  if (!member) return [];

  const inRange = {
    status: "CONFIRMED" as const,
    startTime: { lt: dayEndUtc },
    endTime: { gt: dayStartUtc },
  };

  const [ownAssignments, collectivePools, ownerSolo] = await Promise.all([
    prisma.booking.findMany({
      where: { ...inRange, teamMemberId },
      select: { startTime: true, endTime: true },
    }),
    prisma.booking.findMany({
      where: {
        ...inRange,
        eventType: {
          assignmentMode: "COLLECTIVE",
          members: { some: { teamMemberId } },
        },
      },
      select: { startTime: true, endTime: true },
    }),
    member.isOwner
      ? prisma.booking.findMany({
          where: {
            ...inRange,
            userId: member.userId,
            eventType: { assignmentMode: "SOLO" },
          },
          select: { startTime: true, endTime: true },
        })
      : Promise.resolve([]),
  ]);

  return [...ownAssignments, ...collectivePools, ...ownerSolo].map((b) => ({
    start: b.startTime,
    end: b.endTime,
  }));
}

export function isFreeAt(busy: BusyWindow[], start: Date, end: Date): boolean {
  return !busy.some((b) => start < b.end && end > b.start);
}

// Among candidates known to be free (freeIds), pick whoever has gone the
// longest without an assignment (oldest/null lastAssignedAt wins).
export function pickRoundRobinMember<
  T extends { id: string; lastAssignedAt: Date | null },
>(candidates: T[], freeIds: Set<string>): T | null {
  const free = candidates.filter((c) => freeIds.has(c.id));
  if (free.length === 0) return null;
  free.sort((a, b) => {
    const at = a.lastAssignedAt?.getTime() ?? 0;
    const bt = b.lastAssignedAt?.getTime() ?? 0;
    return at - bt;
  });
  return free[0];
}

// Lazily create the implicit record representing the owner themselves, so
// they can be added to a pool. Inactive by default (must opt in). Idempotent.
export async function ensureOwnerTeamMember(
  userId: string,
  ownerName: string,
): Promise<{ id: string }> {
  const existing = await prisma.teamMember.findFirst({
    where: { userId, isOwner: true },
    select: { id: true },
  });
  if (existing) return existing;
  return prisma.teamMember.create({
    data: { userId, name: ownerName, isOwner: true, active: false },
    select: { id: true },
  });
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors. (`prisma.teamMember` and the new `assignmentMode`/`members`/`teamMemberId` fields must already be in the generated client from Task 1's migration.)

- [ ] **Step 3: Manual verification of the pure helpers**

These two are pure functions, easiest checked directly. Create a throwaway file `scratch-verify.mjs` at the repo root:

```javascript
// scratch-verify.mjs — throwaway, delete after running
function isFreeAt(busy, start, end) {
  return !busy.some((b) => start < b.end && end > b.start);
}
function pickRoundRobinMember(candidates, freeIds) {
  const free = candidates.filter((c) => freeIds.has(c.id));
  if (free.length === 0) return null;
  free.sort((a, b) => (a.lastAssignedAt?.getTime() ?? 0) - (b.lastAssignedAt?.getTime() ?? 0));
  return free[0];
}

const busy = [{ start: new Date("2026-07-01T10:00:00Z"), end: new Date("2026-07-01T10:30:00Z") }];
console.assert(isFreeAt(busy, new Date("2026-07-01T10:30:00Z"), new Date("2026-07-01T11:00:00Z")) === true, "FAIL: should be free right after busy ends");
console.assert(isFreeAt(busy, new Date("2026-07-01T10:15:00Z"), new Date("2026-07-01T10:45:00Z")) === false, "FAIL: should be busy on overlap");

const candidates = [
  { id: "a", lastAssignedAt: new Date("2026-06-30T00:00:00Z") },
  { id: "b", lastAssignedAt: null },
  { id: "c", lastAssignedAt: new Date("2026-06-29T00:00:00Z") },
];
const picked = pickRoundRobinMember(candidates, new Set(["a", "c"]));
console.assert(picked?.id === "c", "FAIL: should pick oldest timestamp among free candidates, got " + picked?.id);
console.assert(pickRoundRobinMember(candidates, new Set(["b"]))?.id === "b", "FAIL: null lastAssignedAt should be eligible and win when it's the only free one");
console.assert(pickRoundRobinMember(candidates, new Set()) === null, "FAIL: no free candidates should return null");

console.log("All checks passed");
```

Run:

```bash
node scratch-verify.mjs
```

Expected output: `All checks passed` (no assertion failures printed above it). Then delete the file:

```bash
rm scratch-verify.mjs
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/team.ts
git commit -m "Add team busy-window computation and round-robin fairness picker"
```

---

### Task 4: `getTeamSlotsForDate` in `src/lib/availability.ts`

**Files:**
- Modify: `src/lib/availability.ts` (add a new export; do not change `getSlotsForDate`)

**Interfaces:**
- Consumes: `getTeamMemberBusyWindows`, `isFreeAt` from `@/lib/team`; the existing `zonedToUtc` helper already in this file (keep it private, just reuse it).
- Produces: `getTeamSlotsForDate(params): Promise<Slot[]>` — same `Slot` shape (`{startUtc, label}`) as the existing solo function, consumed by Task 9.

- [ ] **Step 1: Add the import and the new function**

Add to the top of `src/lib/availability.ts` (after the existing `import { prisma } from "@/lib/prisma";`):

```typescript
import { getTeamMemberBusyWindows, isFreeAt } from "@/lib/team";
```

Append this function at the end of the file:

```typescript
// Generate bookable slots for a date when an event type is ROUND_ROBIN or
// COLLECTIVE. Kept separate from getSlotsForDate so the solo path is
// untouched. `pool` is the event type's active eligible members.
export async function getTeamSlotsForDate(params: {
  assignmentMode: "ROUND_ROBIN" | "COLLECTIVE";
  pool: { id: string }[];
  timeZone: string;
  durationMinutes: number;
  bufferMinutes: number;
  date: string; // YYYY-MM-DD in the business timezone
  maxPerDay?: number | null;
  eventTypeId?: string;
}): Promise<Slot[]> {
  const { assignmentMode, pool, timeZone, durationMinutes, bufferMinutes, date, maxPerDay, eventTypeId } =
    params;
  if (pool.length === 0) return [];

  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return [];

  const weekdayProbe = new TZDate(year, month - 1, day, 12, 0, 0, 0, timeZone);
  const weekday = weekdayProbe.getDay();

  const memberWindows = await prisma.availability.findMany({
    where: { teamMemberId: { in: pool.map((m) => m.id) }, weekday },
    orderBy: { startMinutes: "asc" },
  });
  if (memberWindows.length === 0) return [];

  const dayStartUtc = zonedToUtc(year, month, day, 0, timeZone);
  const dayEndUtc = zonedToUtc(year, month, day, 24 * 60, timeZone);

  // Daily cap on this event type, same semantics as the solo path.
  if (maxPerDay != null && eventTypeId) {
    const countForDay = await prisma.booking.count({
      where: {
        eventTypeId,
        status: "CONFIRMED",
        startTime: { gte: dayStartUtc, lt: dayEndUtc },
      },
    });
    if (countForDay >= maxPerDay) return [];
  }

  // Fetch each pool member's busy windows for the day once, up front.
  const busyByMember = new Map(
    await Promise.all(
      pool.map(
        async (m) => [m.id, await getTeamMemberBusyWindows(m.id, dayStartUtc, dayEndUtc)] as const,
      ),
    ),
  );

  // Build per-member window sets keyed by member id for this weekday.
  const windowsByMember = new Map<string, { startMinutes: number; endMinutes: number }[]>();
  for (const w of memberWindows) {
    const list = windowsByMember.get(w.teamMemberId!) ?? [];
    list.push({ startMinutes: w.startMinutes, endMinutes: w.endMinutes });
    windowsByMember.set(w.teamMemberId!, list);
  }

  // Candidate start-of-window minute marks: union of all distinct
  // (startMinutes) values across members, scanned in fixed durationMinutes
  // steps from each member's own window start (mirrors the solo loop).
  const candidateStarts = new Set<number>();
  for (const list of windowsByMember.values()) {
    for (const w of list) {
      for (let start = w.startMinutes; start + durationMinutes <= w.endMinutes; start += durationMinutes) {
        candidateStarts.add(start);
      }
    }
  }

  const now = Date.now();
  const earliest = now + bufferMinutes * 60_000;
  const poolIds = pool.map((m) => m.id);

  const slots: Slot[] = [];
  for (const start of Array.from(candidateStarts).sort((a, b) => a - b)) {
    const startUtc = zonedToUtc(year, month, day, start, timeZone);
    const endUtc = new Date(startUtc.getTime() + durationMinutes * 60_000);
    if (startUtc.getTime() < earliest) continue;

    // A member "covers" this slot if their own weekly window contains it.
    const covering = poolIds.filter((id) =>
      (windowsByMember.get(id) ?? []).some(
        (w) => start >= w.startMinutes && start + durationMinutes <= w.endMinutes,
      ),
    );
    if (covering.length === 0) continue;
    if (assignmentMode === "COLLECTIVE" && covering.length < poolIds.length) continue;

    const free = covering.filter((id) => isFreeAt(busyByMember.get(id) ?? [], startUtc, endUtc));
    const offer = assignmentMode === "COLLECTIVE" ? free.length === covering.length : free.length > 0;
    if (!offer) continue;

    const hh = Math.floor(start / 60).toString().padStart(2, "0");
    const mm = (start % 60).toString().padStart(2, "0");
    slots.push({ startUtc: startUtc.toISOString(), label: `${hh}:${mm}` });
  }

  return slots;
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors. If `zonedToUtc` is not exported, this still works since the new function lives in the same file/module scope — no export needed for an in-file private helper.

- [ ] **Step 3: Commit**

```bash
git add src/lib/availability.ts
git commit -m "Add getTeamSlotsForDate for round-robin/collective event types"
```

---

### Task 5: `/dashboard/team` page + actions — member list, add/remove, owner toggle

**Files:**
- Create: `src/app/dashboard/team/actions.ts`
- Create: `src/app/dashboard/team/page.tsx`
- Modify: `src/app/dashboard/layout.tsx:7-15` (add nav item)

**Interfaces:**
- Consumes: `ensureOwnerTeamMember` from `@/lib/team`; `planConfig` from `@/lib/plans`; `getCurrentUser` from `@/lib/auth`.
- Produces: `addTeamMemberAction(formData)`, `removeTeamMemberAction(formData)`, `setMemberActiveAction(formData)`, `setOwnerParticipationAction(formData)` — server actions consumed by `page.tsx` forms and (read-only) by Task 7's per-member availability page.

- [ ] **Step 1: Write the actions file**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { planConfig } from "@/lib/plans";

async function requireTeamSchedulingUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  if (!planConfig(user.plan).teamScheduling) {
    throw new Error("Team scheduling requires the Business plan.");
  }
  return user;
}

export async function addTeamMemberAction(formData: FormData) {
  const user = await requireTeamSchedulingUser();
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim() || null;
  if (!name) return;

  await prisma.teamMember.create({
    data: { userId: user.id, name, email },
  });
  revalidatePath("/dashboard/team");
}

export async function removeTeamMemberAction(formData: FormData) {
  const user = await requireTeamSchedulingUser();
  const id = String(formData.get("id") || "");

  // The owner's record can never be hard-deleted, only deactivated.
  const member = await prisma.teamMember.findFirst({ where: { id, userId: user.id } });
  if (!member || member.isOwner) return;

  await prisma.teamMember.delete({ where: { id } });
  revalidatePath("/dashboard/team");
}

export async function setMemberActiveAction(formData: FormData) {
  const user = await requireTeamSchedulingUser();
  const id = String(formData.get("id") || "");
  const active = formData.get("active") === "1";

  await prisma.teamMember.updateMany({
    where: { id, userId: user.id },
    data: { active },
  });
  revalidatePath("/dashboard/team");
}

// Convenience wrapper for the owner's own "include myself" toggle —
// identical mechanism to setMemberActiveAction, kept separate for clarity
// in the UI form that targets the isOwner record specifically.
export async function setOwnerParticipationAction(formData: FormData) {
  const user = await requireTeamSchedulingUser();
  const active = formData.get("active") === "1";

  await prisma.teamMember.updateMany({
    where: { userId: user.id, isOwner: true },
    data: { active },
  });
  revalidatePath("/dashboard/team");
}
```

- [ ] **Step 2: Write the page**

```tsx
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { planConfig } from "@/lib/plans";
import { ensureOwnerTeamMember } from "@/lib/team";
import {
  addTeamMemberAction,
  removeTeamMemberAction,
  setMemberActiveAction,
  setOwnerParticipationAction,
} from "./actions";

export default async function TeamPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  if (!planConfig(user.plan).teamScheduling) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Team</h1>
        <p className="mt-2 text-sm text-slate-600">
          Team scheduling (round-robin and collective booking) is available on the
          Business plan.{" "}
          <Link href="/dashboard/billing" className="font-medium text-indigo-600 hover:underline">
            Upgrade
          </Link>
          .
        </p>
      </div>
    );
  }

  await ensureOwnerTeamMember(user.id, user.name);
  const members = await prisma.teamMember.findMany({
    where: { userId: user.id },
    orderBy: [{ isOwner: "desc" }, { createdAt: "asc" }],
  });
  const owner = members.find((m) => m.isOwner)!;
  const others = members.filter((m) => !m.isOwner);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Team</h1>
      <p className="mt-1 text-sm text-slate-600">
        Add teammates and set their hours so round-robin and collective event types
        know who&apos;s available.
      </p>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-slate-900">{owner.name} (you)</p>
            <p className="text-xs text-slate-500">
              {owner.active ? "Bookable in team event types" : "Not currently bookable"}
            </p>
          </div>
          <form action={setOwnerParticipationAction}>
            <input type="hidden" name="active" value={owner.active ? "0" : "1"} />
            <button
              type="submit"
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {owner.active ? "Remove myself from pools" : "Include myself as a bookable member"}
            </button>
          </form>
        </div>
        <Link
          href={`/dashboard/team/${owner.id}/availability`}
          className="mt-3 inline-block text-sm font-medium text-indigo-600 hover:underline"
        >
          Set my team hours →
        </Link>
      </div>

      <div className="mt-4 space-y-3">
        {others.map((m) => (
          <div key={m.id} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-slate-900">{m.name}</p>
                {m.email && <p className="text-xs text-slate-500">{m.email}</p>}
              </div>
              <div className="flex items-center gap-2">
                <form action={setMemberActiveAction}>
                  <input type="hidden" name="id" value={m.id} />
                  <input type="hidden" name="active" value={m.active ? "0" : "1"} />
                  <button
                    type="submit"
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    {m.active ? "Deactivate" : "Activate"}
                  </button>
                </form>
                <form action={removeTeamMemberAction}>
                  <input type="hidden" name="id" value={m.id} />
                  <button type="submit" className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50">
                    Remove
                  </button>
                </form>
              </div>
            </div>
            <Link
              href={`/dashboard/team/${m.id}/availability`}
              className="mt-3 inline-block text-sm font-medium text-indigo-600 hover:underline"
            >
              Set hours →
            </Link>
          </div>
        ))}
        {others.length === 0 && (
          <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            No teammates yet.
          </p>
        )}
      </div>

      <form action={addTeamMemberAction} className="mt-6 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Name</span>
          <input
            name="name"
            required
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Email (optional)</span>
          <input
            name="email"
            type="email"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500"
          />
        </label>
        <button
          type="submit"
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
        >
          Add teammate
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Add the nav link**

In `src/app/dashboard/layout.tsx`, add to the `navItems` array (after the `Bookings` entry):

```typescript
  { href: "/dashboard/team", label: "Team" },
```

- [ ] **Step 4: Type-check and lint**

```bash
npx tsc --noEmit
npm run lint
```

Expected: no errors (Task 6 creates the `/dashboard/team/[id]/availability` route this page links to — the link itself type-checks fine as a plain string href).

- [ ] **Step 5: Manual verification**

Start the dev server, log in as `demo@demo.com` / `password123` (currently FREE/PRO — confirm via `/dashboard/billing` and use the dev plan switch to set BUSINESS if needed), then visit `/dashboard/team`:
- Confirm "Demo (you)" row appears with "Include myself as a bookable member" button.
- Add a teammate named "Test Teammate" with no email — confirm it appears in the list.
- Click "Deactivate" — confirm label flips to "Activate".
- Click "Remove" — confirm the row disappears.
- Switch the dev plan back to FREE and reload `/dashboard/team` — confirm the upgrade prompt shows instead of the member list.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/team/actions.ts src/app/dashboard/team/page.tsx src/app/dashboard/layout.tsx
git commit -m "Add /dashboard/team member management UI"
```

---

### Task 6: Per-member availability editor

**Files:**
- Create: `src/app/dashboard/team/[id]/availability/page.tsx`
- Modify: `src/app/dashboard/team/actions.ts` (add one action)

**Interfaces:**
- Consumes: the same `toMinutes`/`DAYS` pattern as `src/app/dashboard/availability/page.tsx` and `saveAvailabilityAction` in `src/app/dashboard/actions.ts`.
- Produces: `updateMemberAvailabilityAction(formData)`.

- [ ] **Step 1: Add the action**

Append to `src/app/dashboard/team/actions.ts`:

```typescript
function toMinutes(hhmm: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

export async function updateMemberAvailabilityAction(formData: FormData) {
  const user = await requireTeamSchedulingUser();
  const teamMemberId = String(formData.get("teamMemberId") || "");

  const member = await prisma.teamMember.findFirst({
    where: { id: teamMemberId, userId: user.id },
  });
  if (!member) return;

  const rows: { weekday: number; startMinutes: number; endMinutes: number }[] = [];
  for (let weekday = 0; weekday < 7; weekday++) {
    if (formData.get(`enabled-${weekday}`) !== "on") continue;
    const start = toMinutes(String(formData.get(`start-${weekday}`) || ""));
    const end = toMinutes(String(formData.get(`end-${weekday}`) || ""));
    if (start === null || end === null || end <= start) continue;
    rows.push({ weekday, startMinutes: start, endMinutes: end });
  }

  await prisma.$transaction([
    prisma.availability.deleteMany({ where: { teamMemberId } }),
    prisma.availability.createMany({
      data: rows.map((r) => ({ ...r, userId: user.id, teamMemberId })),
    }),
  ]);

  revalidatePath(`/dashboard/team/${teamMemberId}/availability`);
}
```

This duplicates `toMinutes` from `src/app/dashboard/actions.ts` rather than importing it — that file has no exports meant for cross-route reuse and importing a private helper across unrelated route action files would create an awkward coupling for four lines of regex.

- [ ] **Step 2: Write the page**

```tsx
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateMemberAvailabilityAction } from "../../actions";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function toHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60).toString().padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

export default async function MemberAvailabilityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return null;

  const member = await prisma.teamMember.findFirst({ where: { id, userId: user.id } });
  if (!member) notFound();

  const windows = await prisma.availability.findMany({ where: { teamMemberId: id } });
  const byDay = new Map(windows.map((w) => [w.weekday, w]));

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">
        {member.name}&apos;s hours
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        Hours are in your business timezone ({user.timezone}).
      </p>

      <form action={updateMemberAvailabilityAction} className="mt-6 space-y-3">
        <input type="hidden" name="teamMemberId" value={id} />
        {DAYS.map((day, weekday) => {
          const w = byDay.get(weekday);
          const enabled = Boolean(w);
          return (
            <div
              key={weekday}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4"
            >
              <label className="flex w-32 items-center gap-2">
                <input
                  type="checkbox"
                  name={`enabled-${weekday}`}
                  defaultChecked={enabled}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                />
                <span className="text-sm font-medium text-slate-800">{day}</span>
              </label>
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="time"
                  name={`start-${weekday}`}
                  defaultValue={w ? toHHMM(w.startMinutes) : "09:00"}
                  className="rounded-lg border border-slate-300 px-2 py-1.5 text-slate-900 outline-none focus:border-indigo-500"
                />
                <span>to</span>
                <input
                  type="time"
                  name={`end-${weekday}`}
                  defaultValue={w ? toHHMM(w.endMinutes) : "17:00"}
                  className="rounded-lg border border-slate-300 px-2 py-1.5 text-slate-900 outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          );
        })}
        <button
          type="submit"
          className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500"
        >
          Save hours
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Type-check and lint**

```bash
npx tsc --noEmit
npm run lint
```

Expected: no errors.

- [ ] **Step 4: Manual verification**

From `/dashboard/team`, click "Set hours →" for a teammate, set Mon–Fri 09:00–17:00, save, reload the page — confirm the checkboxes/times persist. Confirm `/dashboard/availability` (the owner's original page) is unaffected (still shows the owner's own pre-existing hours, since those rows have `teamMemberId = null`).

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/team
git commit -m "Add per-team-member weekly availability editor"
```

---

### Task 7: Event-type assignment mode + member pool picker

**Files:**
- Modify: `src/app/dashboard/event-types/[id]/EventTypeEditor.tsx`
- Modify: `src/app/dashboard/event-types/[id]/page.tsx`
- Modify: `src/app/dashboard/actions.ts:117-149` (`updateEventTypeAction`)

**Interfaces:**
- Consumes: `planConfig(user.plan).teamScheduling`; `EventTypeEditor`'s existing `Initial` type (extend it).
- Produces: `EventType.assignmentMode` + `EventTypeMember` rows written by `updateEventTypeAction`.

- [ ] **Step 1: Extend `EventTypeEditor`'s props and add the Assignment section**

In `src/app/dashboard/event-types/[id]/EventTypeEditor.tsx`, change the `Initial` type to add:

```typescript
  assignmentMode: "SOLO" | "ROUND_ROBIN" | "COLLECTIVE";
  poolMemberIds: string[];
  teamMembers: { id: string; name: string; isOwner: boolean }[];
  teamSchedulingEnabled: boolean;
```

Add state near the existing `questions` state:

```typescript
  const [mode, setMode] = useState(initial.assignmentMode);
  const [pool, setPool] = useState<string[]>(initial.poolMemberIds);

  function togglePool(id: string) {
    setPool((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }
```

Add this block right before the final submit `<button>` (after the intake-questions block), only rendering when the plan allows it:

```tsx
      {initial.teamSchedulingEnabled && (
        <div>
          <p className="text-sm font-medium text-slate-700">Assignment</p>
          <p className="text-xs text-slate-500">
            Who handles bookings for this event type.
          </p>
          <input type="hidden" name="assignmentMode" value={mode} />
          <input type="hidden" name="poolMemberIds" value={JSON.stringify(pool)} />
          <div className="mt-2 flex gap-2">
            {(["SOLO", "ROUND_ROBIN", "COLLECTIVE"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
                  mode === m
                    ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                    : "border-slate-300 text-slate-700 hover:bg-slate-50"
                }`}
              >
                {m === "SOLO" ? "Solo" : m === "ROUND_ROBIN" ? "Round-robin" : "Collective"}
              </button>
            ))}
          </div>
          {mode !== "SOLO" && (
            <div className="mt-3 space-y-1">
              {initial.teamMembers.map((m) => (
                <label key={m.id} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={pool.includes(m.id)}
                    onChange={() => togglePool(m.id)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  {m.name}
                  {m.isOwner ? " (you)" : ""}
                </label>
              ))}
              {initial.teamMembers.length === 0 && (
                <p className="text-xs text-slate-400">
                  No active team members yet — add some on the Team page.
                </p>
              )}
            </div>
          )}
        </div>
      )}
```

- [ ] **Step 2: Pass the new data from the page**

In `src/app/dashboard/event-types/[id]/page.tsx`, add imports:

```typescript
import { planConfig } from "@/lib/plans";
```

After the existing `eventType` lookup, add:

```typescript
  const teamSchedulingEnabled = planConfig(user.plan).teamScheduling;
  const [teamMembers, pool] = teamSchedulingEnabled
    ? await Promise.all([
        prisma.teamMember.findMany({
          where: { userId: user.id, active: true },
          select: { id: true, name: true, isOwner: true },
          orderBy: [{ isOwner: "desc" }, { name: "asc" }],
        }),
        prisma.eventTypeMember.findMany({
          where: { eventTypeId: eventType.id },
          select: { teamMemberId: true },
        }),
      ])
    : [[], []];
```

And pass the new props in the `<EventTypeEditor initial={{...}} />` call:

```typescript
          assignmentMode: eventType.assignmentMode,
          poolMemberIds: pool.map((p) => p.teamMemberId),
          teamMembers,
          teamSchedulingEnabled,
```

- [ ] **Step 3: Persist it in `updateEventTypeAction`**

In `src/app/dashboard/actions.ts`, add this import:

```typescript
import { planConfig } from "@/lib/plans";
```

In `updateEventTypeAction`, after the existing `intakeQuestions` computation and before the `prisma.eventType.updateMany` call, add:

```typescript
  const rawMode = String(formData.get("assignmentMode") || "SOLO");
  const teamSchedulingEnabled = planConfig(user.plan).teamScheduling;
  const assignmentMode: "SOLO" | "ROUND_ROBIN" | "COLLECTIVE" =
    teamSchedulingEnabled && (rawMode === "ROUND_ROBIN" || rawMode === "COLLECTIVE")
      ? rawMode
      : "SOLO";
  let poolMemberIds: string[] = [];
  if (assignmentMode !== "SOLO") {
    try {
      const raw = JSON.parse(String(formData.get("poolMemberIds") || "[]"));
      if (Array.isArray(raw)) poolMemberIds = raw.filter((x) => typeof x === "string");
    } catch {
      poolMemberIds = [];
    }
  }
```

Change the `data:` object inside `prisma.eventType.updateMany` to include `assignmentMode,` alongside the existing fields. Then, immediately after that `updateMany` call (still inside the function, before `revalidatePath`), add the pool sync — re-checking every member id belongs to this tenant before writing:

```typescript
  if (assignmentMode !== "SOLO") {
    const validIds = poolMemberIds.length
      ? (
          await prisma.teamMember.findMany({
            where: { id: { in: poolMemberIds }, userId: user.id },
            select: { id: true },
          })
        ).map((m) => m.id)
      : [];
    await prisma.$transaction([
      prisma.eventTypeMember.deleteMany({ where: { eventTypeId: id } }),
      prisma.eventTypeMember.createMany({
        data: validIds.map((teamMemberId) => ({ eventTypeId: id, teamMemberId })),
      }),
    ]);
  } else {
    await prisma.eventTypeMember.deleteMany({ where: { eventTypeId: id } });
  }
```

- [ ] **Step 4: Type-check and lint**

```bash
npx tsc --noEmit
npm run lint
```

Expected: no errors.

- [ ] **Step 5: Manual verification**

With the demo account on BUSINESS plan and at least one active teammate (from Task 5/6), open `/dashboard/event-types/[id]` for an existing event type:
- Confirm the Assignment section appears with Solo/Round-robin/Collective buttons.
- Select Round-robin, check the teammate's box, save.
- Reload the page — confirm Round-robin is still selected and the teammate's checkbox is still checked.
- Switch back to Solo, save, reload — confirm the pool checkboxes are gone (mode reset to Solo) and a direct DB check (`npx prisma studio`, open `EventTypeMember` table) shows no rows for this event type.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/event-types src/app/dashboard/actions.ts
git commit -m "Add assignment-mode and team-pool config to the event-type editor"
```

---

### Task 8: Booking flow — team-aware slot fetch + write-time assignment

**Files:**
- Modify: `src/app/[slug]/actions.ts:28-150` (`fetchSlotsAction`, `createBookingAction`)

**Interfaces:**
- Consumes: `getTeamSlotsForDate` from `@/lib/availability`; `getTeamMemberBusyWindows`, `isFreeAt`, `pickRoundRobinMember` from `@/lib/team`.
- Produces: unchanged public signatures for `fetchSlotsAction`/`createBookingAction` — callers in `BookingWidget.tsx` need no changes.

- [ ] **Step 1: Update `fetchSlotsAction`**

In `src/app/[slug]/actions.ts`, change the import line to:

```typescript
import { getSlotsForDate, getTeamSlotsForDate, type Slot } from "@/lib/availability";
```

Replace the body of `fetchSlotsAction` (the `return getSlotsForDate({...})` call) with:

```typescript
  if (eventType.assignmentMode === "SOLO") {
    return getSlotsForDate({
      userId: eventType.userId,
      timeZone: eventType.user.timezone,
      durationMinutes: eventType.durationMinutes,
      bufferMinutes: eventType.bufferMinutes,
      date,
      maxPerDay: eventType.maxPerDay,
      eventTypeId: eventType.id,
    });
  }

  const pool = await prisma.teamMember.findMany({
    where: { active: true, eventTypes: { some: { eventTypeId: eventType.id } } },
    select: { id: true },
  });
  return getTeamSlotsForDate({
    assignmentMode: eventType.assignmentMode,
    pool,
    timeZone: eventType.user.timezone,
    durationMinutes: eventType.durationMinutes,
    bufferMinutes: eventType.bufferMinutes,
    date,
    maxPerDay: eventType.maxPerDay,
    eventTypeId: eventType.id,
  });
```

- [ ] **Step 2: Add team-aware assignment to `createBookingAction`**

Add the import (alongside the existing ones at the top of the file):

```typescript
import { getTeamMemberBusyWindows, isFreeAt, pickRoundRobinMember } from "@/lib/team";
```

Replace the existing solo-only conflict check block:

```typescript
  // Re-check the slot is still free to avoid double-booking.
  const conflict = await prisma.booking.findFirst({
    where: {
      userId: eventType.userId,
      status: "CONFIRMED",
      startTime: { lt: end },
      endTime: { gt: start },
    },
  });
  if (conflict) {
    return { ok: false, error: "Sorry, that time was just booked. Pick another." };
  }
```

with this mode-aware version:

```typescript
  let assignedTeamMemberId: string | null = null;

  if (eventType.assignmentMode === "SOLO") {
    const conflict = await prisma.booking.findFirst({
      where: {
        userId: eventType.userId,
        status: "CONFIRMED",
        startTime: { lt: end },
        endTime: { gt: start },
      },
    });
    if (conflict) {
      return { ok: false, error: "Sorry, that time was just booked. Pick another." };
    }
  } else {
    const pool = await prisma.teamMember.findMany({
      where: { active: true, eventTypes: { some: { eventTypeId: eventType.id } } },
      select: { id: true, lastAssignedAt: true },
    });
    if (pool.length === 0) {
      return { ok: false, error: "Sorry, that time was just booked. Pick another." };
    }
    const busyByMember = new Map(
      await Promise.all(
        pool.map(async (m) => [m.id, await getTeamMemberBusyWindows(m.id, start, end)] as const),
      ),
    );
    const freeIds = new Set(
      pool.filter((m) => isFreeAt(busyByMember.get(m.id) ?? [], start, end)).map((m) => m.id),
    );

    if (eventType.assignmentMode === "COLLECTIVE") {
      if (freeIds.size !== pool.length) {
        return { ok: false, error: "Sorry, that time was just booked. Pick another." };
      }
    } else {
      const picked = pickRoundRobinMember(pool, freeIds);
      if (!picked) {
        return { ok: false, error: "Sorry, that time was just booked. Pick another." };
      }
      assignedTeamMemberId = picked.id;
    }
  }
```

Update the `prisma.booking.create` call's `data` object to include `teamMemberId: assignedTeamMemberId,` alongside the existing fields. Immediately after that `create` call, add:

```typescript
  if (assignedTeamMemberId) {
    await prisma.teamMember.update({
      where: { id: assignedTeamMemberId },
      data: { lastAssignedAt: new Date() },
    });
  }
```

This whole block (conflict re-check through the `lastAssignedAt` bump) is not yet wrapped in a transaction — Task 9 wraps it.

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/[slug]/actions.ts
git commit -m "Make booking slot fetch and creation team-mode aware"
```

---

### Task 9: Wrap the team write-path in a transaction (race safety)

**Files:**
- Modify: `src/app/[slug]/actions.ts` (the block added in Task 8, Step 2)

**Interfaces:**
- Consumes: `prisma.$transaction` (interactive transaction form, already used elsewhere in this codebase for `saveAvailabilityAction`'s batch form — this task uses the callback form instead since it needs conditional reads before the write).

- [ ] **Step 1: Wrap conflict-check + create + lastAssignedAt bump in one transaction**

This closes the race window the spec calls out: a pool member could be booked by a concurrent request between the freeness check and the insert. Restructure so steps 2 onward of `createBookingAction` (from the conflict check through the email sends) split into a DB-only transaction first, emails after. Replace the assignment block from Task 8 plus the existing `prisma.booking.create` call with:

```typescript
  let assignedTeamMemberId: string | null = null;
  let bookingId: string;
  const manageToken = crypto.randomUUID();

  try {
    bookingId = await prisma.$transaction(async (tx) => {
      if (eventType.assignmentMode === "SOLO") {
        const conflict = await tx.booking.findFirst({
          where: {
            userId: eventType.userId,
            status: "CONFIRMED",
            startTime: { lt: end },
            endTime: { gt: start },
          },
        });
        if (conflict) throw new Error("SLOT_TAKEN");
      } else {
        const pool = await tx.teamMember.findMany({
          where: { active: true, eventTypes: { some: { eventTypeId: eventType.id } } },
          select: { id: true, lastAssignedAt: true },
        });
        if (pool.length === 0) throw new Error("SLOT_TAKEN");

        const busyByMember = new Map(
          await Promise.all(
            pool.map(async (m) => [m.id, await getTeamMemberBusyWindows(m.id, start, end)] as const),
          ),
        );
        const freeIds = new Set(
          pool.filter((m) => isFreeAt(busyByMember.get(m.id) ?? [], start, end)).map((m) => m.id),
        );

        if (eventType.assignmentMode === "COLLECTIVE") {
          if (freeIds.size !== pool.length) throw new Error("SLOT_TAKEN");
        } else {
          const picked = pickRoundRobinMember(pool, freeIds);
          if (!picked) throw new Error("SLOT_TAKEN");
          assignedTeamMemberId = picked.id;
        }
      }

      const created = await tx.booking.create({
        data: {
          userId: eventType.userId,
          eventTypeId: eventType.id,
          inviteeName: name,
          inviteeEmail: email,
          notes: input.notes?.trim() || null,
          startTime: start,
          endTime: end,
          manageToken,
          answers: answersJson,
          teamMemberId: assignedTeamMemberId,
        },
      });

      if (assignedTeamMemberId) {
        await tx.teamMember.update({
          where: { id: assignedTeamMemberId },
          data: { lastAssignedAt: new Date() },
        });
      }

      return created.id;
    });
  } catch (err) {
    if (err instanceof Error && err.message === "SLOT_TAKEN") {
      return { ok: false, error: "Sorry, that time was just booked. Pick another." };
    }
    throw err;
  }
```

Remove the now-duplicated standalone `const manageToken = crypto.randomUUID();` and `await prisma.booking.create({...})` block that previously followed the daily-cap/intake-validation code (those checks stay where they are, just before this new transaction block) — the transaction above is the only place the booking gets created now. `bookingId` isn't otherwise used by the rest of the function (the existing code only ever used `manageToken` to build `manageUrl`), so no further changes are needed below this block.

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors. (`bookingId` will report as an unused variable under default TS settings only if `noUnusedLocals` is on — check `tsconfig.json`; if it errors, prefix with `void bookingId;` on the line after the try/catch block. Otherwise leave as-is for readability/debuggability.)

- [ ] **Step 3: Manual verification — round-robin fairness and race safety**

With one active teammate and a Round-robin event type (from Task 7), book two consecutive appointments as different invitees for two different free time slots in the same day via the public booking page. Open Prisma Studio (`npx prisma studio`) on the `Booking` table and confirm both rows have `teamMemberId` set to the teammate's id, and the `TeamMember` table shows `lastAssignedAt` updated to the most recent booking's timestamp.

Add a second teammate, both active and in the pool, with identical hours. Book three appointments at three different times. Confirm (via Prisma Studio) the `teamMemberId` alternates between the two — first booking goes to whichever has the older/null `lastAssignedAt` (likely the one added first, since both start with `null`), and after each booking the assignment flips because the just-assigned member's `lastAssignedAt` becomes the newest.

- [ ] **Step 4: Commit**

```bash
git add src/app/[slug]/actions.ts
git commit -m "Wrap team booking assignment in a transaction for race safety"
```

---

### Task 10: Reschedule — team-aware re-check and possible reassignment

**Files:**
- Modify: `src/app/booking/[token]/actions.ts:87-176` (`fetchRescheduleSlots`, `rescheduleBookingAction`)

**Interfaces:**
- Consumes: `getTeamSlotsForDate` from `@/lib/availability`; `getTeamMemberBusyWindows`, `isFreeAt`, `pickRoundRobinMember` from `@/lib/team`.

- [ ] **Step 1: Update `fetchRescheduleSlots`**

Change the import line to:

```typescript
import { getSlotsForDate, getTeamSlotsForDate, type Slot } from "@/lib/availability";
import { prisma } from "@/lib/prisma";
```

Replace the function body's `return getSlotsForDate({...})` with:

```typescript
  if (booking.eventType.assignmentMode === "SOLO") {
    return getSlotsForDate({
      userId: booking.userId,
      timeZone: booking.user.timezone,
      durationMinutes: booking.eventType.durationMinutes,
      bufferMinutes: booking.eventType.bufferMinutes,
      date,
    });
  }

  const pool = await prisma.teamMember.findMany({
    where: { active: true, eventTypes: { some: { eventTypeId: booking.eventTypeId } } },
    select: { id: true },
  });
  return getTeamSlotsForDate({
    assignmentMode: booking.eventType.assignmentMode,
    pool,
    timeZone: booking.user.timezone,
    durationMinutes: booking.eventType.durationMinutes,
    bufferMinutes: booking.eventType.bufferMinutes,
    date,
  });
```

- [ ] **Step 2: Update `rescheduleBookingAction`**

Add the import:

```typescript
import { getTeamMemberBusyWindows, isFreeAt, pickRoundRobinMember } from "@/lib/team";
```

Replace the existing conflict-check block:

```typescript
  // Re-check the slot is free, ignoring this booking's own current slot.
  const conflict = await prisma.booking.findFirst({
    where: {
      userId: booking.userId,
      status: "CONFIRMED",
      id: { not: booking.id },
      startTime: { lt: end },
      endTime: { gt: start },
    },
  });
  if (conflict) {
    return { ok: false, error: "Sorry, that time was just booked. Pick another." };
  }
```

with:

```typescript
  let assignedTeamMemberId: string | null = booking.teamMemberId;

  if (booking.eventType.assignmentMode === "SOLO") {
    const conflict = await prisma.booking.findFirst({
      where: {
        userId: booking.userId,
        status: "CONFIRMED",
        id: { not: booking.id },
        startTime: { lt: end },
        endTime: { gt: start },
      },
    });
    if (conflict) {
      return { ok: false, error: "Sorry, that time was just booked. Pick another." };
    }
  } else {
    const pool = await prisma.teamMember.findMany({
      where: { active: true, eventTypes: { some: { eventTypeId: booking.eventTypeId } } },
      select: { id: true, lastAssignedAt: true },
    });
    if (pool.length === 0) {
      return { ok: false, error: "Sorry, that time was just booked. Pick another." };
    }
    // Exclude this booking's own current slot from busy-window checks so
    // rescheduling to overlap your own old slot isn't treated as a conflict.
    const busyByMember = new Map(
      await Promise.all(
        pool.map(async (m) => {
          const windows = await getTeamMemberBusyWindows(m.id, start, end);
          return [m.id, windows.filter((w) => !(w.start.getTime() === booking.startTime.getTime() && w.end.getTime() === booking.endTime.getTime()))] as const;
        }),
      ),
    );
    const freeIds = new Set(
      pool.filter((m) => isFreeAt(busyByMember.get(m.id) ?? [], start, end)).map((m) => m.id),
    );

    if (booking.eventType.assignmentMode === "COLLECTIVE") {
      if (freeIds.size !== pool.length) {
        return { ok: false, error: "Sorry, that time was just booked. Pick another." };
      }
      assignedTeamMemberId = null;
    } else {
      const picked = pickRoundRobinMember(pool, freeIds);
      if (!picked) {
        return { ok: false, error: "Sorry, that time was just booked. Pick another." };
      }
      assignedTeamMemberId = picked.id;
    }
  }
```

Update the `prisma.booking.update` call's `data` object (in the same function) to include `teamMemberId: assignedTeamMemberId,` alongside the existing `startTime, endTime, sequence, rescheduleCount` fields. After that update call, add:

```typescript
  if (assignedTeamMemberId && assignedTeamMemberId !== booking.teamMemberId) {
    await prisma.teamMember.update({
      where: { id: assignedTeamMemberId },
      data: { lastAssignedAt: new Date() },
    });
  }
```

Also update the `include` on the two `prisma.booking.findUnique` calls earlier in this file (in both `fetchRescheduleSlots` and `rescheduleBookingAction`) — no change needed there since `eventType: true` already brings back `assignmentMode` (it's a column on `EventType`, included by default with `eventType: true`).

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Manual verification**

Using the round-robin event type from Task 9 with two teammates: create a booking (note who gets assigned), then use its `/booking/{token}/reschedule` link to move it to a different time where the *other* teammate is free but the original is busy. Confirm via Prisma Studio that `Booking.teamMemberId` changed to the other teammate after the reschedule.

- [ ] **Step 5: Commit**

```bash
git add src/app/booking/[token]/actions.ts
git commit -m "Make reschedule team-mode aware, allowing reassignment"
```

---

### Task 11: Emails and `.ics` show the assigned member(s)

**Files:**
- Modify: `src/app/[slug]/actions.ts` (email-sending section of `createBookingAction`)
- Modify: `src/app/booking/[token]/actions.ts` (`bookingIcs` helper and its two call sites' email text)

**Interfaces:**
- Consumes: nothing new — pure string formatting using data already in scope (`assignedTeamMemberId`, or for collective, the pool fetched earlier in the function).

- [ ] **Step 1: Add a "with" line in `createBookingAction`'s emails**

In `src/app/[slug]/actions.ts`, after the transaction block from Task 9 (where `assignedTeamMemberId` is in scope) and before the `buildIcs` call, add:

```typescript
  let withWho: string | null = null;
  if (eventType.assignmentMode === "ROUND_ROBIN" && assignedTeamMemberId) {
    const m = await prisma.teamMember.findUnique({
      where: { id: assignedTeamMemberId },
      select: { name: true },
    });
    withWho = m?.name ?? null;
  } else if (eventType.assignmentMode === "COLLECTIVE") {
    const pool = await prisma.teamMember.findMany({
      where: { eventTypes: { some: { eventTypeId: eventType.id } } },
      select: { name: true },
    });
    withWho = pool.map((m) => m.name).join(", ") || null;
  }
```

Update the `buildIcs({...})` call's `description` field to:

```typescript
    description: `Booking with ${eventType.user.businessName}${withWho ? ` (with ${withWho})` : ""}. Manage: ${manageUrl}`,
```

Update the invitee email's `text` to insert a "with" line — change:

```typescript
      text: `Hi ${name},\n\nYour booking with ${eventType.user.businessName} is confirmed.\n\nWhat: ${eventType.title}\nWhen: ${inviteeWhen} (${viewerTz})\n\nThe calendar invite is attached. Need to change it? Reschedule or cancel here:\n${manageUrl}\n\nSee you then!`,
```

to:

```typescript
      text: `Hi ${name},\n\nYour booking with ${eventType.user.businessName} is confirmed.\n\nWhat: ${eventType.title}\nWhen: ${inviteeWhen} (${viewerTz})${withWho ? `\nWith: ${withWho}` : ""}\n\nThe calendar invite is attached. Need to change it? Reschedule or cancel here:\n${manageUrl}\n\nSee you then!`,
```

- [ ] **Step 2: Add the same to `src/app/booking/[token]/actions.ts`**

Change `bookingIcs`'s signature and body to accept the pool/assignee name. Replace:

```typescript
function bookingIcs(
  booking: FullBooking,
  method: "REQUEST" | "CANCEL",
  sequence: number,
) {
```

with:

```typescript
function bookingIcs(
  booking: FullBooking,
  method: "REQUEST" | "CANCEL",
  sequence: number,
  withWho: string | null,
) {
```

and change its `description` line to:

```typescript
    description: `Booking with ${booking.user.businessName}${withWho ? ` (with ${withWho})` : ""}.`,
```

Add a shared helper above `bookingIcs` (used by both `cancelBookingAction` and `rescheduleBookingAction`):

```typescript
async function describeAssignee(booking: FullBooking): Promise<string | null> {
  if (booking.eventType.assignmentMode === "ROUND_ROBIN" && booking.teamMemberId) {
    const m = await prisma.teamMember.findUnique({
      where: { id: booking.teamMemberId },
      select: { name: true },
    });
    return m?.name ?? null;
  }
  if (booking.eventType.assignmentMode === "COLLECTIVE") {
    const pool = await prisma.teamMember.findMany({
      where: { eventTypes: { some: { eventTypeId: booking.eventTypeId } } },
      select: { name: true },
    });
    return pool.map((m) => m.name).join(", ") || null;
  }
  return null;
}
```

In `cancelBookingAction`, before the `const cancelIcs = bookingIcs(booking, "CANCEL", sequence);` line, add `const withWho = await describeAssignee(booking);` and change that call to `bookingIcs(booking, "CANCEL", sequence, withWho)`.

In `rescheduleBookingAction`, before the `const updateIcs = bookingIcs(...)` call, add `const withWho = await describeAssignee({ ...booking, teamMemberId: assignedTeamMemberId });` and change the call to pass `withWho` as the fourth argument. Also update the invitee email text in that function — change:

```typescript
      text: `Hi ${booking.inviteeName},\n\nYour booking with ${booking.user.businessName} has been moved to ${when} (${booking.user.timezone}). The updated calendar invite is attached.`,
```

to:

```typescript
      text: `Hi ${booking.inviteeName},\n\nYour booking with ${booking.user.businessName} has been moved to ${when} (${booking.user.timezone})${withWho ? `\nWith: ${withWho}` : ""}. The updated calendar invite is attached.`,
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Manual verification**

Re-run the round-robin booking from Task 9's verification with SMTP unconfigured (the default in dev) and check the server console log (`[email] SMTP not configured — would send:`) — confirm the logged text includes a `With: <teammate name>` line.

- [ ] **Step 5: Commit**

```bash
git add src/app/[slug]/actions.ts src/app/booking/[token]/actions.ts
git commit -m "Include assigned team member name(s) in booking emails and ICS"
```

---

### Task 12: "With" column on owner and admin bookings lists

**Files:**
- Modify: `src/app/dashboard/bookings/page.tsx`
- Modify: `src/lib/admin-bookings-query.ts` (no change needed to query builders — just confirm `teamMemberId` is selectable; the actual change is in the page's `include`)
- Modify: `src/app/admin/bookings/page.tsx`

**Interfaces:**
- Consumes: `Booking.teamMemberId` (Task 1), no new exports.

- [ ] **Step 1: Owner dashboard — `src/app/dashboard/bookings/page.tsx`**

Change the `prisma.booking.findMany` call's `include` from `{ eventType: true }` to:

```typescript
    include: { eventType: true, teamMember: { select: { name: true } } },
```

Add a `with` field to the `Row` component's props type and render it. In the `Row` function signature, add `with: string | null;` to the props type (after `notes: string | null;`), and in the JSX, after the existing `<p>{name} · {email}</p>` line, add:

```tsx
      {props.with && <p className="mt-1 text-xs text-slate-500">With: {props.with}</p>}
```

(Note: `with` is not a reserved word as an object property name, but is awkward as a bare destructured identifier — destructure the props object explicitly as `props` in `Row`'s signature instead of inline-destructuring, i.e. change `function Row({ when, title, name, email, notes, answers, muted, manageToken }: {...})` to `function Row(props: { when: string; title: string; name: string; email: string; notes: string | null; answers?: IntakeAnswer[]; muted?: boolean; manageToken?: string | null; with: string | null }) {` and replace each bare reference (`when`, `title`, etc.) inside the function body with `props.when`, `props.title`, etc.)

In both call sites in the page component (`upcoming.map` and `past.map`), add `with={b.teamMember?.name ?? null}` to the `<Row .../>` props.

- [ ] **Step 2: Admin bookings — `src/app/admin/bookings/page.tsx`**

Change the `prisma.booking.findMany` call's `include` from:

```typescript
        include: { eventType: true, user: { select: { businessName: true, slug: true, suspended: true } } },
```

to:

```typescript
        include: {
          eventType: true,
          teamMember: { select: { name: true } },
          user: { select: { businessName: true, slug: true, suspended: true } },
        },
```

Add a new column header after `<th className="px-4 py-3">Status</th>`:

```tsx
              <th className="px-4 py-3">With</th>
```

Add a corresponding `<td>` after the Status `<td>` block, before the Moderation `<td>`:

```tsx
                <td className="px-4 py-3 text-slate-500">{b.teamMember?.name ?? "—"}</td>
```

Update the `colSpan={5}` on the empty-state row to `colSpan={6}`.

- [ ] **Step 3: Type-check and lint**

```bash
npx tsc --noEmit
npm run lint
```

Expected: no errors.

- [ ] **Step 4: Manual verification**

Visit `/dashboard/bookings` and `/admin/bookings` — confirm the round-robin booking from Task 9 shows the assigned teammate's name, and a solo booking shows nothing (dashboard) / "—" (admin).

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/bookings/page.tsx src/app/admin/bookings/page.tsx
git commit -m "Show assigned team member in owner and admin bookings lists"
```

---

### Task 13: Full end-to-end verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full project checks**

```bash
npx tsc --noEmit
npm run lint
npm run build
```

Expected: all three succeed with no errors (build may print the usual route-size table, no failures).

- [ ] **Step 2: Manual end-to-end walkthrough**

On a BUSINESS-plan account:
1. `/dashboard/team` — add two teammates, set distinct weekly hours for each via their availability pages, include the owner as a third bookable member.
2. Create a new event type, set it to Collective with all three in the pool. Set each member's hours so there's at least one overlapping hour across all three on a given weekday.
3. On the public booking page for that event type, confirm only the overlapping hour appears as a slot, book it, and confirm the confirmation email (console log) lists all three names after "With:".
4. Try booking a second collective slot at a time only two of the three are free — confirm no slot is offered for that time.
5. Change the event type to Round-robin with the same pool, book three appointments at three different free times, and confirm assignment rotates (cross-check `lastAssignedAt` in Prisma Studio as in Task 9).
6. Downgrade the account to PRO via the dev plan switch (`/dashboard/billing`) and confirm `/dashboard/team` now shows the upgrade prompt, while the existing round-robin event type's *public booking page* still works (grandfathered) but its editor no longer lets you change the pool (re-verify the Assignment section is hidden when `teamSchedulingEnabled` is false in Task 7's `EventTypeEditor`).

- [ ] **Step 3: Update project memory**

This is a documentation step, not a code change — update the existing project memory file to mark Team scheduling done, so future sessions don't re-plan it. No commit needed (memory lives outside the repo).
