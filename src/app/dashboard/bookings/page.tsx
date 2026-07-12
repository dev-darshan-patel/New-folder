import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseAnswers, type IntakeAnswer } from "@/lib/intake";
import { parseGuests } from "@/lib/guests";
import { cancelBookingAction } from "@/app/booking/[token]/actions";
import { approveBookingAction, rejectBookingAction } from "./approval-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default async function BookingsPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const now = new Date();
  const [bookings, pending] = await Promise.all([
    prisma.booking.findMany({
      where: { userId: user.id, status: "CONFIRMED" },
      include: { eventType: true, teamMember: { select: { name: true } } },
      orderBy: { startTime: "asc" },
    }),
    prisma.booking.findMany({
      where: { userId: user.id, status: "PENDING" },
      include: { eventType: true, teamMember: { select: { name: true } } },
      orderBy: { startTime: "asc" },
    }),
  ]);

  const upcoming = bookings.filter((b) => b.startTime >= now);
  const past = bookings.filter((b) => b.startTime < now).reverse();

  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: user.timezone,
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Bookings</h1>
        <div className="flex gap-2">
          <Button asChild size="sm">
            <Link href="/dashboard/bookings/new">New booking</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href="/dashboard/bookings/export">Export CSV</a>
          </Button>
        </div>
      </div>
      <p className="mt-1 text-sm text-slate-600">
        Times shown in your timezone ({user.timezone}).
      </p>

      {pending.length > 0 && (
        <Section title="Awaiting approval" empty="">
          {pending.map((b) => (
            <PendingRow
              key={b.id}
              id={b.id}
              when={fmt.format(b.startTime)}
              title={b.eventType.title}
              name={b.inviteeName}
              email={b.inviteeEmail}
              notes={b.notes}
              guests={parseGuests(b.guests)}
              with={b.teamMember?.name ?? null}
            />
          ))}
        </Section>
      )}

      <Section title="Upcoming" empty="No upcoming bookings.">
        {upcoming.map((b) => (
          <Row
            key={b.id}
            when={fmt.format(b.startTime)}
            title={b.eventType.title}
            name={b.inviteeName}
            email={b.inviteeEmail}
            notes={b.notes}
            answers={parseAnswers(b.answers)}
            guests={parseGuests(b.guests)}
            manageToken={b.manageToken}
            meetingUrl={b.meetingUrl}
            meetingProvider={b.meetingProvider}
            series={b.seriesId ? { index: b.seriesIndex ?? 0, total: b.seriesTotal ?? 0 } : null}
            with={b.teamMember?.name ?? null}
          />
        ))}
      </Section>

      {past.length > 0 && (
        <Section title="Past" empty="">
          {past.map((b) => (
            <Row
              key={b.id}
              when={fmt.format(b.startTime)}
              title={b.eventType.title}
              name={b.inviteeName}
              email={b.inviteeEmail}
              notes={b.notes}
              guests={parseGuests(b.guests)}
              meetingUrl={b.meetingUrl}
              meetingProvider={b.meetingProvider}
              muted
              with={b.teamMember?.name ?? null}
            />
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode;
}) {
  const items = Array.isArray(children) ? children : [children];
  const hasItems = items.some(Boolean) && items.flat().length > 0;
  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </h2>
      <div className="mt-3 space-y-3">
        {hasItems ? (
          children
        ) : empty ? (
          <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            {empty}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function Row(props: {
  when: string;
  title: string;
  name: string;
  email: string;
  notes: string | null;
  answers?: IntakeAnswer[];
  guests?: { name?: string; email: string }[];
  muted?: boolean;
  manageToken?: string | null;
  meetingUrl?: string | null;
  meetingProvider?: string | null;
  series?: { index: number; total: number } | null;
  with: string | null;
}) {
  return (
    <Card className={props.muted ? "opacity-60" : ""}>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium text-slate-900">
          {props.title}
          {props.series && (
            <span className="ml-2 rounded bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
              Week {props.series.index}/{props.series.total}
            </span>
          )}
        </p>
        <p className="text-sm text-slate-500">{props.when}</p>
      </div>
      <p className="mt-1 text-sm text-slate-600">
        {props.name} &middot; {props.email}
      </p>
      {props.with && <p className="mt-1 text-xs text-slate-500">With: {props.with}</p>}
      {props.meetingUrl && (
        <p className="mt-1 text-sm">
          <a
            href={props.meetingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-indigo-600 hover:underline"
          >
            {props.meetingProvider === "zoom" ? "Join Zoom Meeting" : "Join Google Meet"} ↗
          </a>
        </p>
      )}
      {props.notes && <p className="mt-1 text-sm text-slate-500">&ldquo;{props.notes}&rdquo;</p>}
      {props.guests && props.guests.length > 0 && (
        <p className="mt-1 text-xs text-slate-500">
          Guests: {props.guests.map((g) => g.name || g.email).join(", ")}
        </p>
      )}
      {props.answers && props.answers.length > 0 && (
        <dl className="mt-2 space-y-0.5 text-sm">
          {props.answers.map((a, i) => (
            <div key={i} className="flex gap-2">
              <dt className="text-slate-500">{a.label}:</dt>
              <dd className="text-slate-700">{a.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {props.manageToken && (
        <div className="mt-3 flex gap-3 border-t border-slate-100 pt-3 text-sm">
          <Button asChild variant="link" className="h-auto p-0 text-indigo-600">
            <Link href={`/booking/${props.manageToken}/reschedule`}>
              Reschedule
            </Link>
          </Button>
          <form action={cancelBookingAction}>
            <input type="hidden" name="token" value={props.manageToken} />
            <Button
              type="submit"
              variant="link"
              className="h-auto p-0 text-red-600"
            >
              Cancel
            </Button>
          </form>
        </div>
      )}
      </CardContent>
    </Card>
  );
}

function PendingRow(props: {
  id: string;
  when: string;
  title: string;
  name: string;
  email: string;
  notes: string | null;
  guests?: { name?: string; email: string }[];
  with: string | null;
}) {
  return (
    <Card className="border-amber-200 bg-amber-50">
      <CardContent className="p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-medium text-slate-900">{props.title}</p>
          <p className="text-sm text-slate-500">{props.when}</p>
        </div>
        <p className="mt-1 text-sm text-slate-600">
          {props.name} &middot; {props.email}
        </p>
        {props.with && <p className="mt-1 text-xs text-slate-500">With: {props.with}</p>}
        {props.notes && <p className="mt-1 text-sm text-slate-500">&ldquo;{props.notes}&rdquo;</p>}
        {props.guests && props.guests.length > 0 && (
          <p className="mt-1 text-xs text-slate-500">
            Guests: {props.guests.map((g) => g.name || g.email).join(", ")}
          </p>
        )}
        <div className="mt-3 flex gap-3 border-t border-amber-200 pt-3 text-sm">
          <form action={approveBookingAction}>
            <input type="hidden" name="id" value={props.id} />
            <Button type="submit" size="sm">
              Approve
            </Button>
          </form>
          <form action={rejectBookingAction}>
            <input type="hidden" name="id" value={props.id} />
            <Button type="submit" size="sm" variant="outline" className="border-red-300 text-red-600 hover:bg-red-50">
              Decline
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
