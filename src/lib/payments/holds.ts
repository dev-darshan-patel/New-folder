import "server-only";
import { prisma } from "@/lib/prisma";
import { releaseTicketedSeats } from "@/lib/ticket-release";
import logger from "@/lib/logger";

// Holds are freed automatically when the invitee takes too long at the
// payment provider. Kept intentionally simple in v1 — expire on age, no
// reconciliation call to the provider yet. Phase 4.5's hardening plan
// includes a follow-up sweep that re-queries the provider before expiring
// (Stripe/Razorpay both let you fetch the session/link and re-check status
// so we never expire a hold the customer actually paid for).
export const HOLD_EXPIRY_MINUTES = 30;

export async function expireStalePaymentHolds(): Promise<number> {
  const cutoff = new Date(Date.now() - HOLD_EXPIRY_MINUTES * 60 * 1000);

  const stale = await prisma.booking.findMany({
    where: {
      status: "PENDING_PAYMENT",
      paymentStatus: "PENDING",
      createdAt: { lt: cutoff },
    },
    select: { id: true, sessionId: true, ticketQty: true, ticketTierId: true },
  });
  if (stale.length === 0) return 0;

  // Ticketed holds reserved real seats at checkout-initiation time (no Ticket
  // rows exist yet — see Booking.ticketQty's schema comment) — give those
  // back one booking at a time before cancelling. 1:1 SOLO holds have no
  // counters to release; their "hold" is purely the blocking booking status.
  for (const b of stale) {
    if (b.sessionId && b.ticketQty != null) {
      await releaseTicketedSeats(prisma, {
        sessionId: b.sessionId,
        tierId: b.ticketTierId,
        qty: b.ticketQty,
      });
    }
  }

  const { count } = await prisma.booking.updateMany({
    where: { id: { in: stale.map((b) => b.id) } },
    data: { status: "CANCELLED", paymentStatus: "EXPIRED" },
  });

  if (count > 0) {
    logger.info({ expired: count }, "Expired stale payment holds");
  }
  return count;
}
