import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import CopyLink from "./CopyLink";
import { Card, CardContent } from "@/components/ui/card";

export default async function DashboardOverview() {
  const user = await getCurrentUser();
  if (!user) return null;

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const bookingUrl = `${baseUrl}/${user.slug}`;

  const [eventTypeCount, upcomingCount] = await Promise.all([
    prisma.eventType.count({ where: { userId: user.id, active: true } }),
    prisma.booking.count({
      where: {
        userId: user.id,
        status: "CONFIRMED",
        startTime: { gte: new Date() },
      },
    }),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">
        Welcome, {user.name.split(" ")[0]}
      </h1>
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

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <StatCard label="Active event types" value={eventTypeCount} href="/dashboard/event-types" />
        <StatCard label="Upcoming bookings" value={upcomingCount} href="/dashboard/bookings" />
      </div>
    </div>
  );
}

function StatCard({ href, label, value }: { href: string; label: string; value: string | number }) {
  return (
    <Link href={href} className="block group">
      <Card className="transition-shadow hover:shadow-sm">
        <CardContent className="p-5">
          <p className="text-sm text-slate-500">{label}</p>
          <p className="mt-1 text-3xl font-bold text-slate-900">{value}</p>
        </CardContent>
      </Card>
    </Link>
  );
}
