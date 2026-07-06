import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { parseGuests } from "@/lib/guests";
import { cancelBookingAction, cancelRemainingSeriesAction } from "./actions";

export default async function ManageBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const sp = await searchParams;

  const booking = await prisma.booking.findUnique({
    where: { manageToken: token },
    include: { eventType: true, user: true },
  });
  if (!booking) notFound();

  const when = new Intl.DateTimeFormat("en-US", {
    timeZone: booking.user.timezone,
    dateStyle: "full",
    timeStyle: "short",
  }).format(booking.startTime);

  const canceled = booking.status === "CANCELLED";
  const pending = booking.status === "PENDING";
  const past = booking.startTime < new Date();
  const guests = parseGuests(booking.guests);

  // For a recurring series, load its sibling occurrences to show the schedule.
  const siblings = booking.seriesId
    ? await prisma.booking.findMany({
        where: { seriesId: booking.seriesId },
        select: { id: true, startTime: true, status: true, manageToken: true, seriesIndex: true },
        orderBy: { startTime: "asc" },
      })
    : [];
  const siblingFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: booking.user.timezone,
    dateStyle: "medium",
    timeStyle: "short",
  });
  // Are there still future, active occurrences from this one onward?
  const hasRemaining =
    booking.seriesId != null &&
    siblings.some(
      (s) => s.startTime >= booking.startTime && (s.status === "CONFIRMED" || s.status === "PENDING"),
    );

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center px-6 py-12">
      <div className="rounded-2xl border border-slate-200 bg-white p-8">
        <p className="text-sm font-medium text-indigo-600">
          {booking.user.businessName}
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
          {booking.eventType.title}
        </h1>

        <dl className="mt-6 space-y-3 text-sm">
          <Row label="When" value={`${when} (${booking.user.timezone})`} />
          <Row label="Name" value={booking.inviteeName} />
          <Row label="Email" value={booking.inviteeEmail} />
          {booking.notes && <Row label="Notes" value={booking.notes} />}
          {guests.length > 0 && (
            <Row
              label="Guests"
              value={guests.map((g) => g.name ? `${g.name} <${g.email}>` : g.email).join(", ")}
            />
          )}
          {booking.seriesId && booking.seriesTotal && (
            <Row
              label="Series"
              value={`Week ${booking.seriesIndex} of ${booking.seriesTotal}`}
            />
          )}
          <Row
            label="Status"
            value={
              canceled ? (
                <span className="font-semibold text-red-600">Canceled</span>
              ) : pending ? (
                <span className="font-semibold text-amber-600">Awaiting approval</span>
              ) : (
                <span className="font-semibold text-green-600">Confirmed</span>
              )
            }
          />
        </dl>

        {siblings.length > 1 && (
          <div className="mt-6 rounded-lg border border-slate-200 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              All sessions in this series
            </p>
            <ul className="mt-2 space-y-1 text-sm">
              {siblings.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3">
                  <span
                    className={
                      s.status === "CANCELLED"
                        ? "text-slate-400 line-through"
                        : s.id === booking.id
                          ? "font-medium text-slate-900"
                          : "text-slate-600"
                    }
                  >
                    {siblingFmt.format(s.startTime)}
                  </span>
                  {s.id !== booking.id && s.manageToken && s.status !== "CANCELLED" && (
                    <Link
                      href={`/booking/${s.manageToken}`}
                      className="text-xs text-indigo-600 hover:underline"
                    >
                      Manage
                    </Link>
                  )}
                  {s.status === "CANCELLED" && (
                    <span className="text-xs text-slate-400">Canceled</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {sp.error === "too_late_to_cancel" && (
          <p className="mt-6 rounded-lg bg-amber-50 px-4 py-3 text-center text-sm text-amber-800">
            This booking is too close to its start time to cancel online. Please
            contact {booking.user.businessName} directly.
          </p>
        )}

        {pending && (
          <p className="mt-6 rounded-lg bg-amber-50 px-4 py-3 text-center text-sm text-amber-800">
            This booking isn&apos;t confirmed yet — {booking.user.businessName} needs
            to approve it first. We&apos;ll email you once it&apos;s decided.
          </p>
        )}

        {!canceled && !pending && !past && booking.meetingUrl && (
          <a
            href={booking.meetingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 block w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-indigo-500"
          >
            {booking.meetingProvider === "zoom" ? "Join Zoom Meeting" : "Join Google Meet"}
          </a>
        )}

        {!canceled && !past && (
          <div className="mt-8 flex gap-3">
            {!pending && !booking.sessionId && !booking.seriesId && (
              <Link
                href={`/booking/${token}/reschedule`}
                className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-indigo-500"
              >
                Reschedule
              </Link>
            )}
            <form action={cancelBookingAction} className="flex-1">
              <input type="hidden" name="token" value={token} />
              <button
                type="submit"
                className="w-full rounded-lg border border-red-300 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50"
              >
                {pending ? "Withdraw request" : booking.seriesId ? "Cancel this session" : "Cancel booking"}
              </button>
            </form>
          </div>
        )}

        {!canceled && !past && booking.seriesId && hasRemaining && (
          <form action={cancelRemainingSeriesAction} className="mt-3">
            <input type="hidden" name="token" value={token} />
            <button
              type="submit"
              className="w-full rounded-lg border border-red-300 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50"
            >
              Cancel this &amp; all remaining sessions
            </button>
          </form>
        )}

        {canceled && (
          <p className="mt-8 rounded-lg bg-slate-50 px-4 py-3 text-center text-sm text-slate-500">
            This booking has been canceled. To book again, visit{" "}
            <Link href={`/${booking.user.slug}`} className="text-indigo-600 hover:underline">
              {booking.user.businessName}
            </Link>
            .
          </p>
        )}

        {!canceled && past && (
          <p className="mt-8 rounded-lg bg-slate-50 px-4 py-3 text-center text-sm text-slate-500">
            This booking has already taken place.
          </p>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right text-slate-900">{value}</dd>
    </div>
  );
}
