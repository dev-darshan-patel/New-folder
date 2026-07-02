import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import RescheduleWidget from "./RescheduleWidget";

export default async function ReschedulePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const booking = await prisma.booking.findUnique({
    where: { manageToken: token },
    include: { eventType: true, user: true },
  });
  if (!booking) notFound();
  // Can't reschedule a canceled or past booking.
  if (booking.status === "CANCELLED" || booking.startTime < new Date()) {
    redirect(`/booking/${token}`);
  }

  const currentWhen = new Intl.DateTimeFormat("en-US", {
    timeZone: booking.user.timezone,
    dateStyle: "full",
    timeStyle: "short",
  }).format(booking.startTime);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-6 py-12">
      <div className="border-b border-slate-200 pb-6">
        <p className="text-sm font-medium text-indigo-600">
          {booking.user.businessName}
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
          Reschedule: {booking.eventType.title}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Currently {currentWhen}. Pick a new time below.
        </p>
      </div>

      <RescheduleWidget token={token} timezone={booking.user.timezone} />
    </div>
  );
}
