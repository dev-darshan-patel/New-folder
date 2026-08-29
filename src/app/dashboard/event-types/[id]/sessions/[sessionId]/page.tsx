import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseAnswers } from "@/lib/intake";
import { planHasFeature } from "@/lib/plans";
import DeskPanel, { SerialEditor, ResendButton } from "./DeskPanel";
import { Card, CardContent } from "@/components/ui/card";

// Owner view: who's booked into this session, with seats-taken vs capacity.
export default async function SessionRosterPage({
  params,
}: {
  params: Promise<{ id: string; sessionId: string }>;
}) {
  const { id: eventTypeId, sessionId } = await params;
  const user = await getCurrentUser();
  if (!user) return null;

  // Ownership: scope through EventType.userId so we can never look at another
  // tenant's session/roster.
  const session = await prisma.session.findFirst({
    where: { id: sessionId, eventType: { id: eventTypeId, userId: user.id } },
    include: {
      eventType: { select: { title: true, durationMinutes: true, issuesTickets: true } },
      tiers: { orderBy: { sortOrder: "asc" } },
      bookings: {
        where: { status: { in: ["CONFIRMED", "PENDING"] } },
        select: {
          id: true,
          inviteeName: true,
          inviteeEmail: true,
          notes: true,
          status: true,
          createdAt: true,
          // Per-ticket check-in status for the roster below. Only populated
          // for ticketed events; empty for classic group sessions.
          tickets: {
            select: {
              id: true,
              serial: true,
              attendeeName: true,
              status: true,
              checkedInAt: true,
              answers: true,
              tier: { select: { name: true } },
            },
            orderBy: { serial: "asc" },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!session) notFound();

  // Aggregate check-in count across all tickets in the session, for the
  // header. Independent of the per-booking ticket lists shown below.
  const checkedInCount = session.eventType.issuesTickets
    ? await prisma.ticket.count({ where: { sessionId, status: "CHECKED_IN" } })
    : 0;

  const canManualRegister =
    session.eventType.issuesTickets &&
    !session.cancelled &&
    (await planHasFeature(user.plan, "manual_bookings"));

  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: user.timezone,
    dateStyle: "full",
    timeStyle: "short",
  });

  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href={`/dashboard/event-types/${eventTypeId}`}
        className="text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        ← {session.eventType.title}
      </Link>
      <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">
        {fmt.format(session.startTime)}
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        {session.unlimited
          ? `${session.bookings.length} booked (unlimited)`
          : `${session.bookings.length} / ${session.capacity} booked`}
        {session.eventType.issuesTickets && ` · ${checkedInCount} checked in`}
        {session.cancelled && " · Canceled"}
      </p>
      {session.eventType.issuesTickets && !session.cancelled && (
        <Link
          href={`/dashboard/event-types/${eventTypeId}/sessions/${sessionId}/scan`}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90"
        >
          Check in tickets →
        </Link>
      )}
      {session.meetingUrl && (
        <p className="mt-2 text-sm">
          <a
            href={session.meetingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary hover:underline"
          >
            {session.meetingProvider === "zoom" ? "Zoom link" : "Meet link"} ↗
          </a>
        </p>
      )}

      <DeskPanel
        sessionId={session.id}
        canManualRegister={canManualRegister}
        tiers={session.tiers.map((t) => ({
          id: t.id,
          name: t.name,
          seatsLeft: t.capacity == null ? null : Math.max(0, t.capacity - t.seatsTaken),
        }))}
      />

      <Card className="mt-8">
      <CardContent className="p-4">
        <h2 className="text-sm font-semibold text-slate-700">Attendees</h2>
        {session.bookings.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No bookings yet.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {session.bookings.map((b) => (
              <li key={b.id} className="py-3 text-sm">
                <p className="font-medium text-foreground">
                  {b.inviteeName}
                  {b.status === "PENDING" && (
                    <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                      Pending
                    </span>
                  )}
                </p>
                <p className="flex flex-wrap items-center gap-2 text-slate-600">
                  {b.inviteeEmail || (
                    <span className="italic text-muted-foreground">no email on file</span>
                  )}
                  {b.tickets.length > 0 && b.inviteeEmail && <ResendButton bookingId={b.id} />}
                </p>
                {b.notes && (
                  <p className="mt-1 text-muted-foreground">&ldquo;{b.notes}&rdquo;</p>
                )}
                {b.tickets.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {b.tickets.map((t) => (
                      <li
                        key={t.serial}
                        className={`rounded px-2 py-0.5 text-xs font-medium ${
                          t.status === "CHECKED_IN"
                            ? "bg-green-100 text-green-800"
                            : t.status === "VOID"
                              ? "bg-red-100 text-red-800"
                              : "bg-muted text-muted-foreground"
                        }`}
                        title={t.checkedInAt ? `Checked in ${t.checkedInAt.toLocaleString()}` : undefined}
                      >
                        <SerialEditor ticketId={t.id} serial={t.serial} />
                        {t.tier ? ` ${t.tier.name}` : ""}
                        {t.attendeeName ? ` · ${t.attendeeName}` : ""}
                        {/* Per-ticket answers (Phase 5b) inline on the badge —
                            this is the race-kit desk view: shirt size has to be
                            readable next to the name, not a click away. */}
                        {parseAnswers(t.answers)
                          .map((a) => ` · ${a.value}`)
                          .join("")}
                        {t.status === "CHECKED_IN" && " ✓"}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      </Card>
    </div>
  );
}
