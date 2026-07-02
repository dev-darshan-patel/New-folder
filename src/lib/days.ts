export type DayOption = { iso: string; label: string };

// Build the next `count` calendar dates (YYYY-MM-DD) in the given IANA timezone,
// each with a short human label. Used by the booking and reschedule pickers.
export function buildDays(timeZone: string, count: number): DayOption[] {
  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone }).format(
    new Date(),
  ); // YYYY-MM-DD
  const [y, m, d] = todayStr.split("-").map(Number);
  const base = Date.UTC(y, m - 1, d);
  const out: DayOption[] = [];
  for (let i = 0; i < count; i++) {
    const dt = new Date(base + i * 86_400_000);
    out.push({
      iso: dt.toISOString().slice(0, 10),
      label: new Intl.DateTimeFormat("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }).format(dt),
    });
  }
  return out;
}
