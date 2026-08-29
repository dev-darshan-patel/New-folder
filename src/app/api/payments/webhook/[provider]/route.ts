import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPaymentAdapter } from "@/lib/payments/registry";
import type { PaymentProvider } from "@/lib/payments/provider";
import { renderTemplate } from "@/lib/email-templates";
import { sendEmail } from "@/lib/email";
import { buildIcs } from "@/lib/ics";
import { formatWhen } from "@/lib/format";
import { releaseTicketedSeats } from "@/lib/ticket-release";
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
    // booking are no-ops — this guard is also what stops a ticketed order's
    // seats from being released twice on a duplicate delivery.
    if (booking.status !== "CANCELLED") {
      if (booking.sessionId && booking.ticketQty != null) {
        await releaseTicketedSeats(prisma, {
          sessionId: booking.sessionId,
          tierId: booking.ticketTierId,
          qty: booking.ticketQty,
        });
      }
      await prisma.booking.update({
        where: { id: booking.id },
        data: { status: "CANCELLED", paymentStatus: "FAILED" },
      });
    }
    return NextResponse.json({ received: true });
  }

  // payment.succeeded.
  if (booking.status === "CONFIRMED" && booking.paymentStatus === "PAID") {
    // Duplicate webhook — nothing to do. This also protects ticket creation
    // below from running twice: once confirmed, every retry short-circuits
    // here before it can allocate a second batch of serials for the same order.
    return NextResponse.json({ received: true, deduped: true });
  }

  // Ticketing (Phase 3b): the seats were already reserved when checkout
  // started — now that payment actually landed, allocate real serials and
  // create the Ticket rows (deferred until now so an abandoned checkout
  // never burns a serial or QR code nobody received). Bumping
  // Session.ticketsIssued is the same atomic monotonic-allocator pattern the
  // free-ticket path uses, just triggered by the webhook instead of the
  // initial booking action.
  let ticketCodes: string[] = [];
  if (booking.sessionId && booking.ticketQty != null) {
    const qty = booking.ticketQty;
    const sessionId = booking.sessionId;
    const rows = await prisma.$queryRaw<{ ticketsIssued: number }[]>`
      UPDATE "Session"
      SET "ticketsIssued" = "ticketsIssued" + ${qty}, "updatedAt" = NOW()
      WHERE id = ${sessionId} AND cancelled = false
      RETURNING "ticketsIssued"
    `;
    if (rows.length === 0) {
      // The session was cancelled by its owner while this customer was at
      // checkout — payment landed for an event that no longer exists. Leave
      // the booking unconfirmed rather than either silently creating tickets
      // for a dead session or auto-refunding; this needs a human to look at
      // it (visible via the booking's PENDING_PAYMENT state + this log).
      logger.error(
        { bookingId: booking.id, sessionId },
        "Paid ticket order's session was cancelled before payment confirmed",
      );
      return NextResponse.json({ received: true, sessionGone: true });
    }
    const serialHigh = Number(rows[0].ticketsIssued);
    // Both stashes were written by createGroupBookingAction and are already
    // validated + positionally aligned with the tickets; a malformed value
    // here would mean our own earlier write was corrupt, so fall back to
    // empty rather than failing a payment that already succeeded.
    const safeParse = <T,>(json: string | null, fallback: T): T => {
      if (!json) return fallback;
      try {
        return JSON.parse(json) as T;
      } catch {
        logger.error({ bookingId: booking.id }, "Corrupt ticket stash JSON on paid booking");
        return fallback;
      }
    };
    const attendeeNames = safeParse<string[]>(booking.ticketAttendeeNames, []);
    const ticketAnswers = safeParse<(string | null)[]>(booking.ticketAnswers, []);
    const rowsToCreate = Array.from({ length: qty }, (_, i) => ({
      bookingId: booking.id,
      sessionId,
      tierId: booking.ticketTierId,
      code: `tkt-${crypto.randomUUID()}`,
      serial: serialHigh - qty + 1 + i,
      attendeeName: attendeeNames[i] || null,
      answers: ticketAnswers[i] ?? null,
    }));
    await prisma.ticket.createMany({ data: rowsToCreate });
    ticketCodes = rowsToCreate.map((r) => r.code);
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

    // Ticketing: link each admission ticket so the buyer can pull up its QR
    // at the gate — same line format the free-ticket path's confirmation uses.
    const ticketLine =
      ticketCodes.length > 0
        ? `\n\nYour ${ticketCodes.length === 1 ? "ticket" : `${ticketCodes.length} tickets`}:` +
          ticketCodes.map((c) => `\n${baseUrl}/ticket/${c}`).join("")
        : "";

    const inviteeEmail = await renderTemplate("booking.confirmed.invitee", {
      invitee_name: booking.inviteeName,
      business_name: booking.user.businessName,
      event_title: booking.eventType.title,
      when,
      timezone: businessTz,
      with_line: ticketLine,
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
