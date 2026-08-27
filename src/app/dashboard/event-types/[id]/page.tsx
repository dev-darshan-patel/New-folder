import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseQuestions } from "@/lib/intake";
import { getPlanConfig } from "@/lib/plans";
import { pricingEligibility } from "@/lib/payments";
import QRCode from "qrcode";
import EventTypeEditor from "./EventTypeEditor";
import SessionsSection from "./SessionsSection";
import TicketDesigner from "./TicketDesigner";

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

  // A real (but meaningless) QR for the designer preview, generated with the
  // same options the live ticket uses so its visual weight on the artwork is
  // accurate. Generated here rather than in the client component to keep the
  // qrcode library out of the browser bundle.
  const sampleQrDataUrl =
    eventType.issuesTickets && has("ticket_designer")
      ? await QRCode.toDataURL("https://example.com/ticket/sample", {
          width: 320,
          margin: 2,
          errorCorrectionLevel: "M",
        })
      : "";
  const teamSchedulingEnabled = has("team_scheduling");
  const pricing = has("payments")
    ? pricingEligibility({
        paymentAccountStatus: user.paymentAccountStatus,
        activePaymentProvider: user.activePaymentProvider,
        country: user.country,
        stripeConnectReady: user.stripeConnectReady,
        razorpayConnectReady: user.razorpayConnectReady,
      })
    : { canPrice: false as const, reason: "Accepting payments isn't available on your current plan." };
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
    <div className="mx-auto max-w-6xl">
      <Link
        href="/dashboard/event-types"
        className="text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        ← Event types
      </Link>
      <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">
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
          paddingMinutes: eventType.paddingMinutes,
          maxAdvanceDays: eventType.maxAdvanceDays,
          confirmationRedirectUrl: eventType.confirmationRedirectUrl ?? "",
          replyToEmail: eventType.replyToEmail ?? "",
          requiresApproval: eventType.requiresApproval,
          unlisted: eventType.unlisted,
          capacity: eventType.capacity,
          allowRecurring: eventType.allowRecurring,
          issuesTickets: eventType.issuesTickets,
          maxTicketsPerOrder: eventType.maxTicketsPerOrder,
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
            ticketing: has("ticketing"),
          },
        }}
      />

      {eventType.capacity != null && (
        <SessionsSection
          eventTypeId={eventType.id}
          defaultCapacity={eventType.capacity}
          durationMinutes={eventType.durationMinutes}
          businessTimezone={user.timezone}
          issuesTickets={eventType.issuesTickets}
          pricing={pricing}
        />
      )}

      {eventType.issuesTickets && has("ticket_designer") && (
        <section className="mt-10 border-t border-border pt-8">
          <h2 className="text-lg font-semibold text-foreground">Ticket design</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload your own ticket artwork and choose where each detail is printed on it.
          </p>
          <div className="mt-4">
            <TicketDesigner
              eventTypeId={eventType.id}
              initialArtworkUrl={eventType.ticketArtworkUrl}
              initialLayout={eventType.ticketLayout}
              sampleQrDataUrl={sampleQrDataUrl}
            />
          </div>
        </section>
      )}
    </div>
  );
}
