import { TZDate } from "@date-fns/tz";
import { prisma } from "@/lib/prisma";
import { getTeamMemberBusyWindows, isFreeAt } from "@/lib/team";

export type Slot = {
  // UTC ISO string for the slot start.
  startUtc: string;
  // Human label in the user's timezone, e.g. "09:30".
  label: string;
};

// Build a Date (UTC instant) from a calendar date + minutes-from-midnight
// interpreted in the given IANA timezone.
function zonedToUtc(
  year: number,
  month: number, // 1-12
  day: number,
  minutesFromMidnight: number,
  timeZone: string,
): Date {
  const hours = Math.floor(minutesFromMidnight / 60);
  const minutes = minutesFromMidnight % 60;
  // TZDate interprets the wall-clock components as local to `timeZone`.
  const zoned = new TZDate(year, month - 1, day, hours, minutes, 0, 0, timeZone);
  return new Date(zoned.getTime());
}

// Generate bookable slots for a single date (YYYY-MM-DD) on a user's booking page.
export async function getSlotsForDate(params: {
  userId: string;
  timeZone: string;
  durationMinutes: number;
  bufferMinutes: number;
  date: string; // YYYY-MM-DD in the user's timezone
  // Per-event-type cap on bookings for this calendar day. null/undefined = none.
  maxPerDay?: number | null;
  // Restrict the day's booking count to a single event type when capping.
  eventTypeId?: string;
}): Promise<Slot[]> {
  const { userId, timeZone, durationMinutes, bufferMinutes, date, maxPerDay, eventTypeId } =
    params;

  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return [];

  // Weekday of the requested date in the user's timezone (0 = Sunday).
  const weekdayProbe = new TZDate(year, month - 1, day, 12, 0, 0, 0, timeZone);
  const weekday = weekdayProbe.getDay();

  const windows = await prisma.availability.findMany({
    where: { userId, weekday },
    orderBy: { startMinutes: "asc" },
  });
  if (windows.length === 0) return [];

  // Bounds of the day in UTC to scope the booking query.
  const dayStartUtc = zonedToUtc(year, month, day, 0, timeZone);
  const dayEndUtc = zonedToUtc(year, month, day, 24 * 60, timeZone);

  const bookings = await prisma.booking.findMany({
    where: {
      userId,
      status: "CONFIRMED",
      startTime: { gte: dayStartUtc, lt: dayEndUtc },
    },
    select: { startTime: true, endTime: true, eventTypeId: true },
  });

  // Daily cap: once this event type hits its limit for the day, no slots remain.
  if (maxPerDay != null && eventTypeId) {
    const countForDay = bookings.filter((b) => b.eventTypeId === eventTypeId).length;
    if (countForDay >= maxPerDay) return [];
  }

  const now = Date.now();
  const earliest = now + bufferMinutes * 60_000;

  const slots: Slot[] = [];
  for (const window of windows) {
    for (
      let start = window.startMinutes;
      start + durationMinutes <= window.endMinutes;
      start += durationMinutes
    ) {
      const startUtc = zonedToUtc(year, month, day, start, timeZone);
      const endUtc = new Date(startUtc.getTime() + durationMinutes * 60_000);

      if (startUtc.getTime() < earliest) continue;

      const overlaps = bookings.some(
        (b) => startUtc < b.endTime && endUtc > b.startTime,
      );
      if (overlaps) continue;

      const hh = Math.floor(start / 60)
        .toString()
        .padStart(2, "0");
      const mm = (start % 60).toString().padStart(2, "0");
      slots.push({ startUtc: startUtc.toISOString(), label: `${hh}:${mm}` });
    }
  }

  return slots;
}

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
