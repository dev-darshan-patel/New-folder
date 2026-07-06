import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
      eventType: { select: { title: true, durationMinutes: true } },
      bookings: {
        where: { status: { in: ["CONFIRMED", "PENDING"] } },
        select: {
          id: true,
          inviteeName: true,
          inviteeEmail: true,
          notes: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!session) notFound();

  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: user.timezone,
    dateStyle: "full",
    timeStyle: "short",
  });

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href={`/dashboard/event-types/${eventTypeId}`}
        className="text-sm font-medium text-slate-500 hover:text-slate-900"
      >
        ← {session.eventType.title}
      </Link>
      <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
        {fmt.format(session.startTime)}
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        {session.bookings.length} / {session.capacity} booked
        {session.cancelled && " · Canceled"}
      </p>
      {session.meetingUrl && (
        <p className="mt-2 text-sm">
          <a
            href={session.meetingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-indigo-600 hover:underline"
          >
            {session.meetingProvider === "zoom" ? "Zoom link" : "Meet link"} ↗
          </a>
        </p>
      )}

      <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-700">Attendees</h2>
        {session.bookings.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            No bookings yet.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {session.bookings.map((b) => (
              <li key={b.id} className="py-3 text-sm">
                <p className="font-medium text-slate-900">
                  {b.inviteeName}
                  {b.status === "PENDING" && (
                    <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                      Pending
                    </span>
                  )}
                </p>
                <p className="text-slate-600">{b.inviteeEmail}</p>
                {b.notes && (
                  <p className="mt-1 text-slate-500">&ldquo;{b.notes}&rdquo;</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
