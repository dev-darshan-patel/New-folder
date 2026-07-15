import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseQuestions } from "@/lib/intake";
import { getPlanConfig } from "@/lib/plans";
import { pricingEligibility } from "@/lib/payments";
import EventTypeEditor from "./EventTypeEditor";
import SessionsSection from "./SessionsSection";

export default async function EditEventTypePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return null;

  const eventType = await prisma.eventType.findFirst({
    where: { id, userId: user.id },
  });
  if (!eventType) notFound();

  const planCfg = await getPlanConfig(user.plan);
  const has = (key: string) => planCfg.featureKeys.includes(key);
  const teamSchedulingEnabled = has("team_scheduling");
  const pricing = pricingEligibility({
    paymentAccountStatus: user.paymentAccountStatus,
    activePaymentProvider: user.activePaymentProvider,
    country: user.country,
    stripeConnectReady: user.stripeConnectReady,
    razorpayConnectReady: user.razorpayConnectReady,
  });
  const [teamMembers, pool, calendarConnection, zoomConnection] = await Promise.all([
    teamSchedulingEnabled
      ? prisma.teamMember.findMany({
          where: { userId: user.id, active: true },
          select: { id: true, name: true, isOwner: true },
          orderBy: [{ isOwner: "desc" }, { name: "asc" }],
        })
      : Promise.resolve([]),
    teamSchedulingEnabled
      ? prisma.eventTypeMember.findMany({
          where: { eventTypeId: eventType.id },
          select: { teamMemberId: true },
        })
      : Promise.resolve([]),
    prisma.calendarConnection.findUnique({
      where: { userId_provider: { userId: user.id, provider: "google" } },
      select: { id: true },
    }),
    prisma.calendarConnection.findUnique({
      where: { userId_provider: { userId: user.id, provider: "zoom" } },
      select: { id: true },
    }),
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/dashboard/event-types"
        className="text-sm font-medium text-slate-500 hover:text-slate-900"
      >
        ← Event types
      </Link>
      <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
        Edit event type
      </h1>

      <EventTypeEditor
        initial={{
          id: eventType.id,
          title: eventType.title,
          description: eventType.description ?? "",
          durationMinutes: eventType.durationMinutes,
          bufferMinutes: eventType.bufferMinutes,
          maxPerDay: eventType.maxPerDay,
          maxPerWeek: eventType.maxPerWeek,
          maxPerMonth: eventType.maxPerMonth,
          minNoticeToCancelMinutes: eventType.minNoticeToCancelMinutes,
          confirmationRedirectUrl: eventType.confirmationRedirectUrl ?? "",
          replyToEmail: eventType.replyToEmail ?? "",
          requiresApproval: eventType.requiresApproval,
          capacity: eventType.capacity,
          allowRecurring: eventType.allowRecurring,
          questions: parseQuestions(eventType.intakeQuestions),
          assignmentMode: eventType.assignmentMode,
          poolMemberIds: pool.map((p) => p.teamMemberId),
          teamMembers,
          teamSchedulingEnabled,
          locationType: eventType.locationType,
          locationDetail: eventType.locationDetail ?? "",
          calendarConnected: Boolean(calendarConnection),
          zoomConnected: Boolean(zoomConnection),
          priceCents: eventType.priceCents,
          currency: eventType.currency,
          pricing: pricing.canPrice
            ? { canPrice: true, currency: pricing.currency }
            : { canPrice: false, reason: pricing.reason },
          features: {
            intakeQuestions: has("intake_questions"),
            schedulingLimits: has("scheduling_limits"),
            videoLinks: has("video_links"),
            approvalFlow: has("approval_flow"),
            redirectReplyTo: has("redirect_replyto"),
            groupBookings: has("group_bookings"),
            recurringBookings: has("recurring_bookings"),
          },
        }}
      />

      {eventType.capacity != null && (
        <SessionsSection
          eventTypeId={eventType.id}
          defaultCapacity={eventType.capacity}
          durationMinutes={eventType.durationMinutes}
          businessTimezone={user.timezone}
        />
      )}
    </div>
  );
}
