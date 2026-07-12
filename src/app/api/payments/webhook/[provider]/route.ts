import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPaymentAdapter } from "@/lib/payments/registry";
import type { PaymentProvider } from "@/lib/payments/provider";
import { renderTemplate } from "@/lib/email-templates";
import { sendEmail } from "@/lib/email";
import { buildIcs } from "@/lib/ics";
import { formatWhen } from "@/lib/format";
import logger from "@/lib/logger";

// Provider webhook receiver. One dynamic route serves both — the [provider]
// path segment picks the adapter, which knows its own signature format.
// Idempotency: a booking already CONFIRMED short-circuits without re-emailing
// (protects against Stripe's at-least-once delivery).
export async function POST(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider: providerParam } = await params;
  const provider = providerParam.toUpperCase();
  if (provider !== "STRIPE" && provider !== "RAZORPAY") {
    return NextResponse.json({ error: "Unknown provider" }, { status: 404 });
  }

  const rawBody = await req.text();
  const signature =
    provider === "STRIPE"
      ? (req.headers.get("stripe-signature") ?? "")
      : (req.headers.get("x-razorpay-signature") ?? "");

  const adapter = getPaymentAdapter(provider as PaymentProvider);

  let event;
  try {
    event = await adapter.verifyWebhook({ rawBody, signature });
  } catch (err) {
    logger.error({ err, provider }, "Payment webhook signature verification failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "unhandled") {
    // Not an event we act on — 200 so the provider stops retrying.
    return NextResponse.json({ received: true, ignored: event.providerEventType });
  }

  const booking = await prisma.booking.findFirst({
    where: { id: event.bookingId, providerPaymentId: event.providerPaymentId },
    include: { eventType: true, user: true },
  });
  if (!booking) {
    logger.error({ event, provider }, "Webhook booking not found");
    return NextResponse.json({ received: true });
  }

  if (event.type === "payment.failed") {
    // Free the slot. Idempotent-safe: repeated events on an already-cancelled
    // booking are no-ops.
    if (booking.status !== "CANCELLED") {
      await prisma.booking.update({
        where: { id: booking.id },
        data: { status: "CANCELLED", paymentStatus: "FAILED" },
      });
    }
    return NextResponse.json({ received: true });
  }

  // payment.succeeded.
  if (booking.status === "CONFIRMED" && booking.paymentStatus === "PAID") {
    // Duplicate webhook — nothing to do.
    return NextResponse.json({ received: true, deduped: true });
  }

  await prisma.booking.update({
    where: { id: booking.id },
    data: {
      status: "CONFIRMED",
      paymentStatus: "PAID",
      amountCents: event.amount.amount,
      currency: event.amount.currency,
      // Feature 4.6: money now sits with the platform. Release cron will
      // transfer to the tenant 24h after the appointment ends.
      payoutStatus: "HELD",
    },
  });

  // Send the confirmation email + ICS now (same shape as the free path).
  // Failures here must not undo the CONFIRMED state — the money already landed.
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const manageUrl = `${baseUrl}/booking/${booking.manageToken}`;
    const businessTz = booking.user.timezone;
    const when = formatWhen(booking.startTime, businessTz);

    const ics = buildIcs({
      uid: booking.manageToken ?? booking.id,
      sequence: 0,
      method: "REQUEST",
      start: booking.startTime,
      end: booking.endTime,
      title: `${booking.eventType.title} — ${booking.user.businessName}`,
      description: `Booking with ${booking.user.businessName}. Manage: ${manageUrl}`,
      organizerName: booking.user.businessName,
      organizerEmail: booking.user.email,
      attendeeName: booking.inviteeName,
      attendeeEmail: booking.inviteeEmail,
    });
    const icsAttachment = {
      filename: "invite.ics",
      content: ics,
      contentType: "text/calendar; charset=utf-8; method=REQUEST",
    };

    const inviteeEmail = await renderTemplate("booking.confirmed.invitee", {
      invitee_name: booking.inviteeName,
      business_name: booking.user.businessName,
      event_title: booking.eventType.title,
      when,
      timezone: businessTz,
      with_line: "",
      manage_url: manageUrl,
    });
    await sendEmail({
      to: booking.inviteeEmail,
      ...inviteeEmail,
      attachments: [icsAttachment],
      ...(booking.eventType.replyToEmail ? { replyTo: booking.eventType.replyToEmail } : {}),
    });

    const ownerEmail = await renderTemplate("booking.created.owner", {
      invitee_name: booking.inviteeName,
      invitee_email: booking.inviteeEmail,
      event_title: booking.eventType.title,
      when,
      timezone: businessTz,
      extra: "\nPaid via checkout.",
    });
    await sendEmail({ to: booking.user.email, ...ownerEmail, attachments: [icsAttachment] });
  } catch (err) {
    logger.error({ err, bookingId: booking.id }, "Failed to send paid-booking confirmation email");
  }

  return NextResponse.json({ received: true });
}
