import { prisma } from "@/lib/prisma";
import { planConfig } from "@/lib/plans";
import type { Plan } from "@prisma/client";

export type DayPoint = { date: string; signups: number; bookings: number; mrr: number; cumulativeUsers: number };

export type AdminAnalytics = {
  kpis: {
    mrr: number;
    arr: number;
    totalUsers: number;
    payingUsers: number;
    conversionPct: number;
    churnedCount: number;
    churnPct: number;
    arpu: number;
    activationPct: number;
    activeBusinesses7: number;
    activeBusinesses30: number;
    totalBookings: number;
    bookingsInRange: number;
    signupsInRange: number;
  };
  series: DayPoint[];
  funnel: { label: string; count: number }[];
  planMix: { plan: Plan; count: number }[];
  topByBookings: { id: string; name: string; bookings: number }[];
  topByRevenue: { id: string; name: string; mrr: number }[];
};

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// One pass over users + bookings produces every figure the dashboard needs.
export async function getAdminAnalytics(rangeDays: number): Promise<AdminAnalytics> {
  const [users, bookings] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true,
        businessName: true,
        createdAt: true,
        plan: true,
        subscriptionStatus: true,
        _count: { select: { bookings: true, eventTypes: true, availability: true } },
      },
    }),
    prisma.booking.findMany({ select: { createdAt: true, startTime: true, userId: true, status: true } }),
  ]);

  const now = Date.now();
  const price = (p: Plan) => planConfig(p).priceMonthly;

  const payingUsers = users.filter((u) => u.plan !== "FREE");
  const mrr = payingUsers.reduce((s, u) => s + price(u.plan), 0);
  const totalUsers = users.length;
  const churnedCount = users.filter((u) => u.subscriptionStatus === "canceled").length;

  const activatedUsers = users.filter((u) => u._count.bookings > 0).length;

  const within = (ms: number, d: Date) => now - d.getTime() <= ms;
  const active7 = new Set(
    bookings.filter((b) => within(7 * 86_400_000, b.createdAt)).map((b) => b.userId),
  );
  const active30 = new Set(
    bookings.filter((b) => within(30 * 86_400_000, b.createdAt)).map((b) => b.userId),
  );

  // Build per-day buckets for the selected range.
  const series: DayPoint[] = [];
  const rangeStart = new Date(now - (rangeDays - 1) * 86_400_000);
  rangeStart.setUTCHours(0, 0, 0, 0);

  const signupsByDay = new Map<string, number>();
  for (const u of users) signupsByDay.set(dayKey(u.createdAt), (signupsByDay.get(dayKey(u.createdAt)) ?? 0) + 1);
  const bookingsByDay = new Map<string, number>();
  for (const b of bookings) bookingsByDay.set(dayKey(b.createdAt), (bookingsByDay.get(dayKey(b.createdAt)) ?? 0) + 1);

  // Pre-sort users for cumulative/MRR-to-date calc.
  const usersSorted = [...users].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  let signupsInRange = 0;
  let bookingsInRange = 0;
  // Sweep usersSorted with a single cursor instead of re-filtering the full
  // list on every day (O(days + users) instead of O(days * users)).
  let cursor = 0;
  let cumulativeUsers = 0;
  let mrrToDate = 0;
  for (let i = 0; i < rangeDays; i++) {
    const day = new Date(rangeStart.getTime() + i * 86_400_000);
    const key = dayKey(day);
    const dayEnd = day.getTime() + 86_400_000;
    const s = signupsByDay.get(key) ?? 0;
    const bk = bookingsByDay.get(key) ?? 0;
    signupsInRange += s;
    bookingsInRange += bk;
    // Approximate MRR-to-date: paying users that existed by end of this day
    // (we don't track upgrade history, so signup date is the proxy).
    while (cursor < usersSorted.length && usersSorted[cursor].createdAt.getTime() < dayEnd) {
      const u = usersSorted[cursor];
      cumulativeUsers += 1;
      if (u.plan !== "FREE") mrrToDate += price(u.plan);
      cursor += 1;
    }
    series.push({
      date: key,
      signups: s,
      bookings: bk,
      mrr: mrrToDate,
      cumulativeUsers,
    });
  }

  const funnel = [
    { label: "Signed up", count: totalUsers },
    { label: "Set availability", count: users.filter((u) => u._count.availability > 0).length },
    { label: "Created event type", count: users.filter((u) => u._count.eventTypes > 0).length },
    { label: "Received a booking", count: activatedUsers },
    { label: "Upgraded to paid", count: payingUsers.length },
  ];

  const planMix = (["FREE", "PRO", "BUSINESS"] as Plan[]).map((plan) => ({
    plan,
    count: users.filter((u) => u.plan === plan).length,
  }));

  const topByBookings = [...users]
    .map((u) => ({ id: u.id, name: u.businessName, bookings: u._count.bookings }))
    .sort((a, b) => b.bookings - a.bookings)
    .slice(0, 5);

  const topByRevenue = [...payingUsers]
    .map((u) => ({ id: u.id, name: u.businessName, mrr: price(u.plan) }))
    .sort((a, b) => b.mrr - a.mrr)
    .slice(0, 5);

  return {
    kpis: {
      mrr,
      arr: mrr * 12,
      totalUsers,
      payingUsers: payingUsers.length,
      conversionPct: totalUsers ? (payingUsers.length / totalUsers) * 100 : 0,
      churnedCount,
      churnPct: payingUsers.length + churnedCount ? (churnedCount / (payingUsers.length + churnedCount)) * 100 : 0,
      arpu: totalUsers ? mrr / totalUsers : 0,
      activationPct: totalUsers ? (activatedUsers / totalUsers) * 100 : 0,
      activeBusinesses7: active7.size,
      activeBusinesses30: active30.size,
      totalBookings: bookings.length,
      bookingsInRange,
      signupsInRange,
    },
    series,
    funnel,
    planMix,
    topByBookings,
    topByRevenue,
  };
}
