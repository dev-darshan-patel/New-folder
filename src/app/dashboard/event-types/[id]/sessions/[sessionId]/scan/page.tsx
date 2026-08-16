import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { planHasFeature } from "@/lib/plans";
import Scanner from "./Scanner";

// The check-in scanner. Owner-only — a tenant scans their own event's tickets
// at the gate. Deliberately kept simple: one page, one session, no dashboard
// chrome around it, so a phone held up to a QR is one big fast surface.
export default async function ScanPage({
  params,
}: {
  params: Promise<{ id: string; sessionId: string }>;
}) {
  const { id: eventTypeId, sessionId } = await params;
  const user = await getCurrentUser();
  if (!user) return null;

  // Ownership: the session must belong to an event type this user owns AND
  // that event type must issue tickets. Both checks in one query so we can
  // never accidentally show the scanner for a plain group session (or worse,
  // for another tenant's event).
  const session = await prisma.session.findFirst({
    where: {
      id: sessionId,
      eventType: { id: eventTypeId, userId: user.id, issuesTickets: true },
    },
    include: {
      eventType: { select: { title: true } },
    },
  });
  if (!session) notFound();

  // Plan gate: hide the scanner UI when the plan doesn't grant ticketing.
  // The server action re-checks ownership on every call, so this is a
  // courtesy layer only — a downgraded tenant with tickets already sold
  // wouldn't be blocked from admitting them, they just have to use the API
  // path or upgrade. Given how narrow that case is, hiding is enough here.
  if (!(await planHasFeature(user.plan, "ticketing"))) notFound();

  const checkedIn = await prisma.ticket.count({
    where: { sessionId, status: "CHECKED_IN" },
  });

  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: user.timezone,
    dateStyle: "full",
    timeStyle: "short",
  });

  return (
    <div className="mx-auto max-w-md">
      <Link
        href={`/dashboard/event-types/${eventTypeId}/sessions/${sessionId}`}
        className="text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        ← Back to session
      </Link>
      <h1 className="mt-2 text-xl font-bold tracking-tight text-foreground">
        Check in · {session.eventType.title}
      </h1>
      <p className="mt-0.5 text-sm text-slate-600">{fmt.format(session.startTime)}</p>

      <div className="mt-6">
        <Scanner
          sessionId={sessionId}
          initialCheckedIn={checkedIn}
          capacity={session.unlimited ? null : session.capacity}
        />
      </div>
    </div>
  );
}
