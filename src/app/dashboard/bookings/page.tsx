import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseAnswers, type IntakeAnswer } from "@/lib/intake";
import { cancelBookingAction } from "@/app/booking/[token]/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default async function BookingsPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const now = new Date();
  const bookings = await prisma.booking.findMany({
    where: { userId: user.id, status: "CONFIRMED" },
    include: { eventType: true, teamMember: { select: { name: true } } },
    orderBy: { startTime: "asc" },
  });

  const upcoming = bookings.filter((b) => b.startTime >= now);
  const past = bookings.filter((b) => b.startTime < now).reverse();

  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: user.timezone,
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Bookings</h1>
      <p className="mt-1 text-sm text-slate-600">
        Times shown in your timezone ({user.timezone}).
      </p>

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
            manageToken={b.manageToken}
            meetingUrl={b.meetingUrl}
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
              meetingUrl={b.meetingUrl}
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
  muted?: boolean;
  manageToken?: string | null;
  meetingUrl?: string | null;
  with: string | null;
}) {
  return (
    <Card className={props.muted ? "opacity-60" : ""}>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium text-slate-900">{props.title}</p>
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
            Join Google Meet ↗
          </a>
        </p>
      )}
      {props.notes && <p className="mt-1 text-sm text-slate-500">&ldquo;{props.notes}&rdquo;</p>}
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
