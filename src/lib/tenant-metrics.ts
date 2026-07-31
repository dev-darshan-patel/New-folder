import { prisma } from "@/lib/prisma";

export type TenantDayPoint = { date: string; bookings: number };

export type TenantAnalytics = {
  kpis: {
    bookingsInRange: number;
    // Sum of amountCents for bookings that were paid within the range.
    // Revenue recognition is keyed off createdAt (when the booking/payment
    // happened), same as bookingsInRange, not off the appointment's startTime.
    revenueCentsInRange: number;
  };
  series: TenantDayPoint[];
};

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// One pass over this tenant's bookings in the selected window produces the
// day-by-day series and its totals. Mirrors the aggregation pattern in
// src/lib/admin-metrics.ts (one broad query, all derivation in JS) — a single
// tenant's booking volume is small enough that this scales fine without
// per-day queries or a groupBy.
export async function getTenantAnalytics(
  userId: string,
  rangeDays: number,
): Promise<TenantAnalytics> {
  const now = Date.now();
  const rangeStart = new Date(now - (rangeDays - 1) * 86_400_000);
  rangeStart.setUTCHours(0, 0, 0, 0);

  const bookings = await prisma.booking.findMany({
    where: { userId, createdAt: { gte: rangeStart } },
    select: { createdAt: true, paymentStatus: true, amountCents: true },
  });

  const bookingsByDay = new Map<string, number>();
  let revenueCentsInRange = 0;
  for (const b of bookings) {
    const key = dayKey(b.createdAt);
    bookingsByDay.set(key, (bookingsByDay.get(key) ?? 0) + 1);
    if (b.paymentStatus === "PAID" && b.amountCents) revenueCentsInRange += b.amountCents;
  }

  const series: TenantDayPoint[] = [];
  for (let i = 0; i < rangeDays; i++) {
    const day = new Date(rangeStart.getTime() + i * 86_400_000);
    series.push({ date: dayKey(day), bookings: bookingsByDay.get(dayKey(day)) ?? 0 });
  }

  return {
    kpis: {
      bookingsInRange: bookings.length,
      revenueCentsInRange,
    },
    series,
  };
}

// Whether this tenant has ever completed a paid booking — used to decide
// whether the revenue KPI is worth showing at all. A tenant who can accept
// payments but hasn't yet doesn't need a permanent "$0.00" card.
export async function hasEverBeenPaid(userId: string): Promise<boolean> {
  const row = await prisma.booking.findFirst({
    where: { userId, paymentStatus: "PAID" },
    select: { id: true },
  });
  return row !== null;
}
