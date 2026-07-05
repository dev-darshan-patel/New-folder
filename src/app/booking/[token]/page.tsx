import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { parseGuests } from "@/lib/guests";
import { cancelBookingAction } from "./actions";

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
            {!pending && (
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
                {pending ? "Withdraw request" : "Cancel booking"}
              </button>
            </form>
          </div>
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
