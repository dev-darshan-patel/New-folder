import { describe, it, expect } from "vitest";
import { generateWeeklyOccurrences, utcToZonedYmd } from "@/lib/availability";

// Wall-clock time of a UTC instant in a zone, as "HH:MM".
function localTime(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(instant);
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const NY = "America/New_York";

describe("generateWeeklyOccurrences — DST safety", () => {
  // The whole reason this function exists instead of `start + 7*24h`. Adding a
  // fixed 168 hours shifts the wall-clock time by an hour whenever the series
  // crosses a daylight-saving boundary, so a 6pm appointment silently becomes
  // 7pm (spring) or 5pm (autumn) for every occurrence after the switch.
  it("keeps the local wall-clock time across US spring-forward", () => {
    // 2026-03-03 18:00 EST (UTC-5). DST starts 2026-03-08.
    const first = new Date("2026-03-03T23:00:00Z");
    const out = generateWeeklyOccurrences({
      firstStartUtc: first,
      count: 2,
      timeZone: NY,
      durationMinutes: 30,
    });

    expect(localTime(out[0].start, NY)).toBe("18:00");
    expect(localTime(out[1].start, NY)).toBe("18:00");

    // 18:00 EDT (UTC-4) — one hour EARLIER in UTC than the naive
    // 2026-03-10T23:00:00Z, which would render as 19:00 local.
    expect(out[1].start.toISOString()).toBe("2026-03-10T22:00:00.000Z");

    // Guards the test itself: if this delta were exactly a week, the chosen
    // dates wouldn't actually straddle a DST boundary and the assertions
    // above would pass trivially.
    expect(out[1].start.getTime() - out[0].start.getTime()).not.toBe(WEEK_MS);
  });

  it("keeps the local wall-clock time across US fall-back", () => {
    // 2026-10-27 18:00 EDT (UTC-4). DST ends 2026-11-01.
    const first = new Date("2026-10-27T22:00:00Z");
    const out = generateWeeklyOccurrences({
      firstStartUtc: first,
      count: 2,
      timeZone: NY,
      durationMinutes: 30,
    });

    expect(localTime(out[0].start, NY)).toBe("18:00");
    expect(localTime(out[1].start, NY)).toBe("18:00");

    // 18:00 EST — one hour LATER in UTC than the naive 2026-11-03T22:00:00Z,
    // which would render as 17:00 local.
    expect(out[1].start.toISOString()).toBe("2026-11-03T23:00:00.000Z");
    expect(out[1].start.getTime() - out[0].start.getTime()).not.toBe(WEEK_MS);
  });

  it("holds the wall-clock time across a whole series spanning DST", () => {
    const out = generateWeeklyOccurrences({
      firstStartUtc: new Date("2026-03-03T23:00:00Z"),
      count: 6,
      timeZone: NY,
      durationMinutes: 45,
    });
    expect(out).toHaveLength(6);
    for (const occ of out) {
      expect(localTime(occ.start, NY)).toBe("18:00");
    }
  });
});

describe("generateWeeklyOccurrences — basics", () => {
  it("spaces occurrences exactly one week apart when no DST boundary is crossed", () => {
    const out = generateWeeklyOccurrences({
      firstStartUtc: new Date("2026-06-02T22:00:00Z"),
      count: 3,
      timeZone: NY,
      durationMinutes: 30,
    });
    expect(out[1].start.getTime() - out[0].start.getTime()).toBe(WEEK_MS);
    expect(out[2].start.getTime() - out[1].start.getTime()).toBe(WEEK_MS);
  });

  it("derives end from durationMinutes", () => {
    const out = generateWeeklyOccurrences({
      firstStartUtc: new Date("2026-06-02T22:00:00Z"),
      count: 1,
      timeZone: NY,
      durationMinutes: 90,
    });
    expect(out[0].end.getTime() - out[0].start.getTime()).toBe(90 * 60_000);
  });

  it("rolls over month and year boundaries", () => {
    // 2026-12-29 -> 2027-01-05 (crosses both).
    const out = generateWeeklyOccurrences({
      firstStartUtc: new Date("2026-12-29T23:00:00Z"),
      count: 2,
      timeZone: NY,
      durationMinutes: 30,
    });
    expect(out[1].start.toISOString()).toBe("2027-01-05T23:00:00.000Z");
  });

  it("returns an empty list for count 0", () => {
    expect(
      generateWeeklyOccurrences({
        firstStartUtc: new Date("2026-06-02T22:00:00Z"),
        count: 0,
        timeZone: NY,
        durationMinutes: 30,
      }),
    ).toEqual([]);
  });
});

describe("utcToZonedYmd", () => {
  // Cap checks re-derive a booking's calendar day from its UTC startTime, so
  // getting this wrong near midnight would count a booking against the wrong
  // day/week/month than the one the slot UI showed.
  it("returns the calendar date as seen in the target zone, not UTC", () => {
    // 23:30 UTC is already the next calendar day in Kolkata (UTC+5:30).
    const instant = new Date("2026-06-01T23:30:00Z");
    expect(utcToZonedYmd(instant, "Asia/Kolkata")).toEqual({ year: 2026, month: 6, day: 2 });
    expect(utcToZonedYmd(instant, "UTC")).toEqual({ year: 2026, month: 6, day: 1 });
  });

  it("handles a zone behind UTC across midnight", () => {
    // 02:00 UTC is still the previous day in New York (UTC-4 in June).
    const instant = new Date("2026-06-02T02:00:00Z");
    expect(utcToZonedYmd(instant, NY)).toEqual({ year: 2026, month: 6, day: 1 });
  });
});
