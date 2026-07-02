# Team scheduling (#A2) — design

Status: approved by user 2026-07-01. Ready for implementation planning.

## Goal

Let a business with multiple staff offer event types that are handled by a
*team* rather than the single account owner, with two assignment styles:

- **Round-robin** — one of several eligible team members is auto-assigned per
  booking, rotated fairly among whoever is actually free.
- **Collective** — every member of a fixed pool must be free; all of them are
  implicitly part of the booking (e.g. a panel interview).

This is gated to the **BUSINESS** plan, matching the existing "Team
scheduling (coming soon)" line in `src/lib/plans.ts`.

## Non-goals (explicitly out of scope)

- Team members do **not** get their own login/password. They are resources
  managed entirely by the business owner — no invites, no per-member
  dashboards, no team-level roles/permissions.
- No customer-facing "pick your person" UI. Assignment is automatic,
  consistent with the round-robin/collective naming.
- No per-booking attendee list for collective bookings — the pool is fixed
  per event type, so it's implied rather than stored per booking.

## Data model (additive migration)

```prisma
model TeamMember {
  id             String    @id @default(cuid())
  userId         String    // tenant — the business this member belongs to
  user           User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  name           String
  email          String?
  // Auto-created, represents the owner themselves when they opt in to a pool.
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

enum AssignmentMode {
  SOLO          // current behavior, unchanged — the owner is the only person
  ROUND_ROBIN
  COLLECTIVE
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

Field additions to existing models:

- `EventType.assignmentMode AssignmentMode @default(SOLO)`
- `Availability.teamMemberId String?` — FK to `TeamMember`, nullable.
  `null` = the existing per-business/owner hours (current rows, unchanged
  meaning). Non-null = that specific team member's own hours.
- `Booking.teamMemberId String?` — FK to `TeamMember`, `onDelete: SetNull`.
  Set only for `ROUND_ROBIN` assignments. Stays `null` for `SOLO` (unchanged)
  and for `COLLECTIVE` (pool is implied by the event type, not stored here).

All additions are nullable or carry a default, so the migration is purely
additive: no unique-constraint or data-loss prompts, runs non-interactively
via `prisma migrate dev` like the rest of this project's migration history.
Existing SOLO behavior is byte-for-byte the current code path — untouched.

## Owner-side team management — `/dashboard/team`

BUSINESS-plan gated (FREE/PRO see an upgrade prompt, same pattern as
`/dashboard/branding`).

- **Member list**: name, email, active/inactive toggle, "(you)" badge on the
  owner's auto-created record. Add/remove teammates.
  - Removing a member hard-deletes their `TeamMember` row, cascading their
    `Availability` and `EventTypeMember` rows. Existing `Booking.teamMemberId`
    references go `null` via `onDelete: SetNull` so historical bookings
    aren't broken.
  - The owner's `isOwner` record can never be hard-deleted — `removeTeamMemberAction`
    rejects it. Participation is controlled solely via the toggle below.
  - Inactive members are excluded from slot generation (treated as never
    free) without being removed from any `EventTypeMember` pool they belong
    to — same soft-disable pattern as `EventType.active`.
- **"Include myself as a bookable member"** toggle — flips the owner's
  auto-created `isOwner` record's `active` flag. Off by default behavior
  preserved: solo event types work exactly as today regardless of this
  toggle.
- **Per-member availability editor**: the existing weekly-grid component
  from `/dashboard/availability`, parameterized to write `teamMemberId`
  instead of operating on the implicit owner scope.

New server actions in `src/app/dashboard/team/actions.ts`:
`addTeamMemberAction`, `removeTeamMemberAction`, `setMemberActiveAction`,
`setOwnerParticipationAction`, `updateMemberAvailabilityAction`. Each
re-checks `planConfig(user.plan).teamScheduling` and tenant ownership
(`where: { userId: user.id }`), consistent with every other dashboard action
in this codebase.

## Event-type assignment configuration

On `/dashboard/event-types/[id]`, BUSINESS plan only, a new "Assignment"
section below the existing duration/limits/intake fields:

- **Mode selector**: Solo (default, unchanged) / Round-robin / Collective.
- When non-Solo: a multi-select checklist of active team members (the pool).
  At least 1 required for round-robin; 2+ recommended (not enforced) for
  collective.
- Mode can be changed at any time; it only affects future slot
  generation/bookings — existing `Booking` rows are untouched.

`updateEventTypeAction` (existing file) validates the plan gate and, for
non-SOLO modes, replaces the event type's `EventTypeMember` rows from the
submitted member-id list (each re-checked to belong to `userId`).

## Slot generation & assignment

**New helper** `getTeamMemberBusyWindows(teamMemberId, dayStartUtc, dayEndUtc)`
— a person can't double-book regardless of which event type caused the
conflict, so this checks:

1. Bookings where `teamMemberId` = them (their round-robin assignments)
2. Bookings on any COLLECTIVE event type where they're in the pool (these
   don't set `teamMemberId`, so this checks pool membership via
   `EventTypeMember`)
3. If `isOwner`: also the owner's own SOLO-event-type bookings (`userId`
   match, no `teamMemberId`)

**New function** `getTeamSlotsForDate(eventType, pool, date)` — kept
separate from the existing `getSlotsForDate` so the SOLO path is completely
untouched:

- **Round-robin**: offer a slot if the *union* of all pool members'
  availability covers it, and at least one of them is free at that time.
- **Collective**: offer a slot only if the *intersection* of all pool
  members' availability covers it, and *every* member is free at that time.
- The existing per-event-type `maxPerDay` cap still applies unchanged.

**At write time**, inside one `prisma.$transaction` (extends the existing
solo overlap re-check rather than replacing it):

- **Round-robin**: re-verify the slot, pick the free pool member with the
  oldest/null `lastAssignedAt`, re-confirm that specific member is still
  free, insert the `Booking` with their `teamMemberId`, bump their
  `lastAssignedAt`. If they raced into busy, fall back to the next-fairest
  free member; if none remain, reject with the existing "slot no longer
  available" message.
- **Collective**: re-verify every pool member is still free before
  inserting (no `teamMemberId` set); otherwise reject the same way.

This preserves the existing double-booking guarantee (slots hide busy times,
write-time re-check before insert) and just extends "busy" from "this one
user's calendar" to "this team member's calendar across whatever caused it."

## Emails & visibility

- **Confirmation emails** (`src/lib/email.ts`, `.ics` generation): SOLO
  unchanged. ROUND_ROBIN adds "with {member.name}" to invitee + owner
  emails and the `.ics` description. COLLECTIVE adds "with {pool names}".
- **Reschedule**: re-runs the same team-aware availability check and may
  reassign a different round-robin member if the original is no longer free
  at the new time.
- **`/dashboard/bookings`**: new "With" column — assigned member name
  (round-robin), pool names (collective), blank for solo.
- **`/admin/bookings`**: same "With" column, one more `select` field in
  `admin-bookings-query.ts`, no new join logic since `teamMemberId` already
  lives on `Booking`.
- No new admin *actions* — team membership is owner-managed only, matching
  existing tenant-isolation: admins observe, owners manage.

## Plan gating

- `src/lib/plans.ts`: add `teamScheduling: boolean` to `PlanConfig`, `true`
  only for `BUSINESS`. Drop "(coming soon)" from the existing BUSINESS
  feature-list bullet.
- Server-side enforced everywhere (not just UI hiding): `/dashboard/team`
  actions and `updateEventTypeAction` both check
  `planConfig(user.plan).teamScheduling`.
- Downgrade behavior: existing team event types and members keep working if
  a BUSINESS account downgrades, but new member/pool edits are blocked —
  same "grandfather existing, block new" pattern `maxEventTypes` already
  uses.
