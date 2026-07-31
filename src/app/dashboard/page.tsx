import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTenantAnalytics, hasEverBeenPaid } from "@/lib/tenant-metrics";
import { planHasFeature } from "@/lib/plans";
import { approveBookingAction, rejectBookingAction } from "./bookings/approval-actions";
import CopyLink from "./CopyLink";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart } from "@/components/admin/Charts";

const RANGES = [7, 30, 90];

function shortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}`;
}

export default async function DashboardOverview({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) return null;

  const sp = await searchParams;
  const range = RANGES.includes(Number(sp.range)) ? Number(sp.range) : 30;

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const bookingUrl = `${baseUrl}/${user.slug}`;

  const [
    eventTypeCount,
    analytics,
    canAcceptPayments,
    everPaid,
    upcomingCount,
    upcoming,
    pending,
  ] = await Promise.all([
    prisma.eventType.count({ where: { userId: user.id, active: true } }),
    getTenantAnalytics(user.id, range),
    planHasFeature(user.plan, "payments"),
    hasEverBeenPaid(user.id),
    prisma.booking.count({
      where: { userId: user.id, status: "CONFIRMED", startTime: { gte: new Date() } },
    }),
    // Capped at 5 for display — upcomingCount above is the real total.
    prisma.booking.findMany({
      where: { userId: user.id, status: "CONFIRMED", startTime: { gte: new Date() } },
      include: { eventType: { select: { title: true } } },
      orderBy: { startTime: "asc" },
      take: 5,
    }),
    prisma.booking.findMany({
      where: { userId: user.id, status: "PENDING" },
      include: { eventType: { select: { title: true } } },
      orderBy: { startTime: "asc" },
    }),
  ]);

  // Only worth a card once the tenant has actually taken a payment — a
  // permanent "$0.00" for an eligible-but-unused tenant is noise, not signal.
  const showRevenue = canAcceptPayments && everPaid;

  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: user.timezone,
    dateStyle: "medium",
    timeStyle: "short",
  });

  const bookingPoints = analytics.series.map((p) => ({
    label: shortDate(p.date),
    value: p.bookings,
  }));

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Welcome, {user.name.split(" ")[0]}
        </h1>
        <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm">
          {RANGES.map((r) => (
            <Link
              key={r}
              href={`/dashboard?range=${r}`}
              className={`rounded-md px-3 py-1.5 font-medium ${
                r === range ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {r}d
            </Link>
          ))}
        </div>
      </div>
      <p className="mt-1 text-sm text-slate-600">
        Here&apos;s your booking page. Share this link with your customers.
      </p>

      <Card className="mt-6">
        <CardContent className="p-5">
          <p className="mb-2 text-sm font-medium text-slate-700">
            Your booking link
          </p>
          <CopyLink url={bookingUrl} />
          <Link
            href={`/${user.slug}`}
            target="_blank"
            className="mt-3 inline-block text-sm font-medium text-indigo-600 hover:underline"
          >
            Open booking page ↗
          </Link>
        </CardContent>
      </Card>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Kpi label={`Bookings (${range}d)`} value={analytics.kpis.bookingsInRange} />
        <StatCard label="Upcoming" value={upcomingCount} href="/dashboard/bookings" />
        <StatCard label="Event types" value={eventTypeCount} href="/dashboard/event-types" />
        {pending.length > 0 ? (
          <Kpi label="Awaiting approval" value={pending.length} highlight />
        ) : (
          <Kpi label="Awaiting approval" value={0} />
        )}
        {showRevenue && (
          <Kpi
            label={`Revenue (${range}d)`}
            value={`$${(analytics.kpis.revenueCentsInRange / 100).toFixed(2)}`}
          />
        )}
      </div>

      <Card className="mt-6">
        <CardContent className="p-5">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Bookings ({range}d)
          </p>
          <div className="mt-2">
            <BarChart points={bookingPoints} color="#4f46e5" />
          </div>
        </CardContent>
      </Card>

      {pending.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Awaiting approval
          </h2>
          <div className="mt-3 space-y-3">
            {pending.map((b) => (
              <Card key={b.id} className="border-amber-200 bg-amber-50">
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{b.eventType.title}</p>
                    <p className="text-xs text-slate-600">
                      {fmt.format(b.startTime)} · {b.inviteeName}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <form action={approveBookingAction}>
                      <input type="hidden" name="id" value={b.id} />
                      <Button type="submit" size="sm">Approve</Button>
                    </form>
                    <form action={rejectBookingAction}>
                      <input type="hidden" name="id" value={b.id} />
                      <Button type="submit" size="sm" variant="outline" className="border-red-300 text-red-600 hover:bg-red-50">
                        Decline
                      </Button>
                    </form>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section className="mt-8">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Upcoming
          </h2>
          <Link href="/dashboard/bookings" className="text-sm font-medium text-indigo-600 hover:underline">
            View all
          </Link>
        </div>
        <div className="mt-3 space-y-2">
          {upcoming.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
              No upcoming bookings.
            </p>
          ) : (
            upcoming.map((b) => (
              <Card key={b.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-2 p-4">
                  <p className="text-sm font-medium text-slate-900">{b.eventType.title}</p>
                  <p className="text-sm text-slate-500">
                    {fmt.format(b.startTime)} · {b.inviteeName}
                  </p>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function StatCard({ href, label, value }: { href: string; label: string; value: string | number }) {
  return (
    <Link href={href} className="block group">
      <Card className="transition-shadow hover:shadow-sm">
        <CardContent className="p-4">
          <p className="text-xs text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
        </CardContent>
      </Card>
    </Link>
  );
}

function Kpi({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string | number;
  highlight?: boolean;
}) {
  return (
    <Card className={highlight ? "border-amber-200 bg-amber-50" : ""}>
      <CardContent className="p-4">
        <p className="text-xs text-slate-500">{label}</p>
        <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
      </CardContent>
    </Card>
  );
}
