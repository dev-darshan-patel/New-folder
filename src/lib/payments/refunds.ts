import "server-only";
import { prisma } from "@/lib/prisma";
import { getPaymentAdapter } from "@/lib/payments/registry";
import type { PaymentProvider } from "@/lib/payments/provider";
import logger from "@/lib/logger";

export type RefundOutcome =
  | { ok: true; refunded: boolean }
  | { ok: false; error: string };

// Refund a paid booking's payment, choosing the right provider call based on
// where the money currently sits:
//  - payoutStatus HELD: money is still on the platform → refund() reverses
//    the original charge directly.
//  - payoutStatus RELEASED: money already moved to the tenant → we must first
//    reverseTransfer() to pull it back to the platform, THEN refund().
// Called from three places (Phase 4.7): invitee/owner self-service cancel,
// the account-deletion cascade, and the admin manual-refund action — all
// funnel through here so the HELD-vs-RELEASED branching lives in one place.
export async function refundBookingPayment(bookingId: string): Promise<RefundOutcome> {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) return { ok: false, error: "Booking not found." };

  // Nothing to refund — either never paid, or already refunded/reversed.
  if (booking.paymentStatus !== "PAID") {
    return { ok: true, refunded: false };
  }
  if (!booking.paymentProvider || !booking.providerPaymentId || !booking.amountCents) {
    logger.error({ bookingId }, "Cannot refund booking: missing payment metadata");
    return { ok: false, error: "Booking is missing payment details." };
  }

  const provider = booking.paymentProvider as PaymentProvider;
  const adapter = getPaymentAdapter(provider);
  const amount = { amount: booking.amountCents, currency: booking.currency ?? "USD" };

  try {
    if (booking.payoutStatus === "RELEASED") {
      if (!booking.transferId) {
        return { ok: false, error: "Payout was released but has no transfer id on file." };
      }
      await adapter.reverseTransfer({
        transferId: booking.transferId,
        amount,
        bookingId: booking.id,
        idempotencyKey: `reverse_${booking.id}`,
      });
    }

    // Whether HELD or just-reversed-from-RELEASED, the customer-facing refund
    // always happens against the original payment.
    await adapter.refund({
      providerPaymentId: booking.providerPaymentId,
      amount,
      bookingId: booking.id,
      idempotencyKey: `refund_${booking.id}`,
    });

    await prisma.booking.update({
      where: { id: booking.id },
      data: {
        paymentStatus: "REFUNDED",
        payoutStatus: booking.payoutStatus === "RELEASED" ? "REVERSED" : "REFUNDED",
      },
    });

    logger.info({ bookingId: booking.id, provider }, "Booking payment refunded");
    return { ok: true, refunded: true };
  } catch (err) {
    logger.error({ err, bookingId: booking.id, provider }, "Failed to refund booking payment");
    return { ok: false, error: "Refund failed. The provider was unreachable or rejected the request." };
  }
}
