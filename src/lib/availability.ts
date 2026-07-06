import { TZDate } from "@date-fns/tz";
import { prisma } from "@/lib/prisma";
import { getTeamMemberBusyWindows, isFreeAt } from "@/lib/team";
import { BLOCKING_STATUSES } from "@/lib/booking-status";

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

// Shift a calendar date by `delta` days using plain calendar-day arithmetic
// (month/year rollover handled by Date, no timezone involved yet — the result
// is fed back into zonedToUtc for a DST-safe conversion).
function addDaysCalendar(
  year: number,
  month: number,
  day: number,
  delta: number,
): { year: number; month: number; day: number } {
  const d = new Date(Date.UTC(year, month - 1, day + delta));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

// UTC [start, end) bounds for the Sun-Sat calendar week containing `date`,
// in the given timezone.
function weekRangeUtc(
  year: number,
  month: number,
  day: number,
  timeZone: string,
): { start: Date; end: Date } {
  const probe = new TZDate(year, month - 1, day, 12, 0, 0, 0, timeZone);
  const weekday = probe.getDay();
  const start = addDaysCalendar(year, month, day, -weekday);
  const end = addDaysCalendar(start.year, start.month, start.day, 7);
  return {
    start: zonedToUtc(start.year, start.month, start.day, 0, timeZone),
    end: zonedToUtc(end.year, end.month, end.day, 0, timeZone),
  };
}

// UTC [start, end) bounds for the calendar month containing `date`, in the
// given timezone.
function monthRangeUtc(
  year: number,
  month: number,
  timeZone: string,
): { start: Date; end: Date } {
  const next = new Date(Date.UTC(year, month, 1)); // `month` (1-based) as the
  // 0-based index into Date.UTC's next month — e.g. month=7 (July) -> index 7 = August.
  return {
    start: zonedToUtc(year, month, 1, 0, timeZone),
    end: zonedToUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), 0, timeZone),
  };
}

// Calendar Y/M/D of a UTC instant, as seen in the given timezone. Inverse of
// zonedToUtc — used to re-derive the wall-clock date for a booking's startTime
// so write-time cap checks look at the same week/month the slot UI did.
export function utcToZonedYmd(
  instant: Date,
  timeZone: string,
): { year: number; month: number; day: number } {
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
  const [year, month, day] = iso.split("-").map(Number);
  return { year, month, day };
}

// Wall-clock minutes-from-midnight of a UTC instant, as seen in the timezone.
function utcToZonedMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return h * 60 + m;
}

// Generate the UTC start/end instants for a WEEKLY recurring series: the same
// weekday and wall-clock time as `firstStartUtc`, repeated `count` times, 7
// calendar days apart, in the business timezone.
//
// DST-CRITICAL: we do NOT add 7*24h of milliseconds (that would shift the
// wall-clock time by ±1h across a daylight-saving boundary). Instead we take
// the first occurrence's wall-clock date + time, advance the *calendar date*
// by 7 days per step, and re-convert that date+time to a UTC instant via
// zonedToUtc — so "Tuesday 18:00" stays 18:00 local even as its UTC offset
// changes across the DST switch.
export function generateWeeklyOccurrences(params: {
  firstStartUtc: Date;
  count: number;
  timeZone: string;
  durationMinutes: number;
}): { start: Date; end: Date }[] {
  const { firstStartUtc, count, timeZone, durationMinutes } = params;
  const minutes = utcToZonedMinutes(firstStartUtc, timeZone);
  const firstYmd = utcToZonedYmd(firstStartUtc, timeZone);

  const out: { start: Date; end: Date }[] = [];
  for (let i = 0; i < count; i++) {
    const ymd = addDaysCalendar(firstYmd.year, firstYmd.month, firstYmd.day, i * 7);
    const start = zonedToUtc(ymd.year, ymd.month, ymd.day, minutes, timeZone);
    const end = new Date(start.getTime() + durationMinutes * 60_000);
    out.push({ start, end });
  }
  return out;
}

// True if this event type has already hit its weekly or monthly cap for the
// week/month containing `date` — in which case the whole day has no slots.
// Shared by the solo and team slot generators.
export async function weekOrMonthCapHit(params: {
  eventTypeId: string;
  year: number;
  month: number;
  day: number;
  timeZone: string;
  maxPerWeek?: number | null;
  maxPerMonth?: number | null;
}): Promise<boolean> {
  const { eventTypeId, year, month, day, timeZone, maxPerWeek, maxPerMonth } = params;
  if (maxPerWeek != null) {
    const { start, end } = weekRangeUtc(year, month, day, timeZone);
    const count = await prisma.booking.count({
      where: { eventTypeId, status: { in: BLOCKING_STATUSES }, startTime: { gte: start, lt: end } },
    });
    if (count >= maxPerWeek) return true;
  }
  if (maxPerMonth != null) {
    const { start, end } = monthRangeUtc(year, month, timeZone);
    const count = await prisma.booking.count({
      where: { eventTypeId, status: { in: BLOCKING_STATUSES }, startTime: { gte: start, lt: end } },
    });
    if (count >= maxPerMonth) return true;
  }
  return false;
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
  // Per-event-type caps on bookings for the calendar week/month. null/undefined = none.
  maxPerWeek?: number | null;
  maxPerMonth?: number | null;
  // Restrict the day's booking count to a single event type when capping.
  eventTypeId?: string;
}): Promise<Slot[]> {
  const { userId, timeZone, durationMinutes, bufferMinutes, date, maxPerDay, maxPerWeek, maxPerMonth, eventTypeId } =
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
      status: { in: BLOCKING_STATUSES },
      startTime: { gte: dayStartUtc, lt: dayEndUtc },
    },
    select: { startTime: true, endTime: true, eventTypeId: true },
  });

  // Daily cap: once this event type hits its limit for the day, no slots remain.
  if (maxPerDay != null && eventTypeId) {
    const countForDay = bookings.filter((b) => b.eventTypeId === eventTypeId).length;
    if (countForDay >= maxPerDay) return [];
  }

  // Weekly/monthly cap: same "whole day is off" semantics as the daily cap.
  if ((maxPerWeek != null || maxPerMonth != null) && eventTypeId) {
    const capped = await weekOrMonthCapHit({
      eventTypeId,
      year,
      month,
      day,
      timeZone,
      maxPerWeek,
      maxPerMonth,
    });
    if (capped) return [];
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
  maxPerWeek?: number | null;
  maxPerMonth?: number | null;
  eventTypeId?: string;
}): Promise<Slot[]> {
  const { assignmentMode, pool, timeZone, durationMinutes, bufferMinutes, date, maxPerDay, maxPerWeek, maxPerMonth, eventTypeId } =
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
        status: { in: BLOCKING_STATUSES },
        startTime: { gte: dayStartUtc, lt: dayEndUtc },
      },
    });
    if (countForDay >= maxPerDay) return [];
  }

  // Weekly/monthly cap, same "whole day is off" semantics as the daily cap.
  if ((maxPerWeek != null || maxPerMonth != null) && eventTypeId) {
    const capped = await weekOrMonthCapHit({
      eventTypeId,
      year,
      month,
      day,
      timeZone,
      maxPerWeek,
      maxPerMonth,
    });
    if (capped) return [];
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
