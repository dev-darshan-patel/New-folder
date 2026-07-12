import "server-only";
import { prisma } from "@/lib/prisma";
import { getPaymentAdapter } from "@/lib/payments/registry";
import { getPlatformSettings } from "@/lib/settings";
import type { PaymentProvider } from "@/lib/payments/provider";
import logger from "@/lib/logger";

// Release payouts to tenants 24 hours after the appointment ends. Escrow
// window is measured from endTime (not paidAt) because the "24h after service
// delivered" guarantee is the whole point of holding funds — a customer who
// paid a week early and cancelled after the fact needs the full refund window,
// not a countdown from payment.
export const RELEASE_DELAY_HOURS = 24;

// Bounded retry — a permanently unfixable payout (e.g. tenant's Stripe account
// was closed) shouldn't loop forever. After the limit, RELEASE_FAILED sits in
// /admin/payments waiting for manual intervention.
const MAX_ATTEMPTS = 5;

export function computePlatformFee(amountCents: number, feePercent: number): number {
  if (feePercent <= 0) return 0;
  // Floor so the tenant never receives less than shown; the platform bears
  // rounding down. Same convention used across every payment gateway I've
  // reviewed for fee math.
  return Math.floor((amountCents * feePercent) / 100);
}

export type ReleaseSummary = { attempted: number; released: number; failed: number };

export async function releaseDuePayouts(): Promise<ReleaseSummary> {
  const cutoff = new Date(Date.now() - RELEASE_DELAY_HOURS * 60 * 60 * 1000);

  const due = await prisma.booking.findMany({
    where: {
      status: "CONFIRMED",
      paymentStatus: "PAID",
      // Retry RELEASE_FAILED rows until the bounded attempt limit — HELD is
      // the first-attempt case; RELEASE_FAILED with attempts < MAX_ATTEMPTS
      // is the retry case.
      payoutStatus: { in: ["HELD", "RELEASE_FAILED"] },
      payoutAttempts: { lt: MAX_ATTEMPTS },
      endTime: { lte: cutoff },
      // Belt-and-braces: only pay tenants who currently have a functioning
      // connect account. A suspension or onboarding regression pauses payouts
      // automatically.
      user: {
        paymentAccountStatus: "APPROVED",
      },
    },
    include: {
      user: {
        select: {
          id: true,
          stripeConnectAccountId: true,
          stripeConnectReady: true,
          razorpayLinkedAccountId: true,
          razorpayConnectReady: true,
        },
      },
    },
  });

  if (due.length === 0) return { attempted: 0, released: 0, failed: 0 };

  const settings = await getPlatformSettings();
  const feePercent = settings.paymentFeePercent;

  let released = 0;
  let failed = 0;

  for (const booking of due) {
    if (!booking.paymentProvider || !booking.amountCents || !booking.currency) {
      // Malformed row — mark failed once so it's visible in admin, but don't
      // retry it endlessly.
      await prisma.booking.update({
        where: { id: booking.id },
        data: {
          payoutStatus: "RELEASE_FAILED",
          payoutFailureReason: "Missing payment metadata on booking row.",
          payoutAttempts: { increment: 1 },
        },
      });
      failed += 1;
      continue;
    }
    const provider = booking.paymentProvider as PaymentProvider;
    const connectAccountId =
      provider === "STRIPE"
        ? booking.user.stripeConnectAccountId
        : booking.user.razorpayLinkedAccountId;
    const ready =
      provider === "STRIPE" ? booking.user.stripeConnectReady : booking.user.razorpayConnectReady;

    if (!connectAccountId || !ready) {
      await prisma.booking.update({
        where: { id: booking.id },
        data: {
          payoutStatus: "RELEASE_FAILED",
          payoutFailureReason: "Tenant onboarding not complete.",
          payoutAttempts: { increment: 1 },
        },
      });
      failed += 1;
      continue;
    }

    const feeCents = computePlatformFee(booking.amountCents, feePercent);
    const transferAmount = booking.amountCents - feeCents;

    try {
      const adapter = getPaymentAdapter(provider);
      const result = await adapter.releaseTransfer({
        tenantId: booking.user.id,
        tenantConnectAccountId: connectAccountId,
        providerPaymentId: booking.providerPaymentId ?? "",
        bookingId: booking.id,
        amount: { amount: transferAmount, currency: booking.currency },
        // Stable across retries — the provider treats a duplicate call with
        // the same key as a no-op, returning the original transfer id.
        idempotencyKey: `release_${booking.id}`,
      });
      await prisma.booking.update({
        where: { id: booking.id },
        data: {
          payoutStatus: "RELEASED",
          transferId: result.transferId,
          releasedAt: new Date(),
          platformFeeCents: feeCents,
          payoutFailureReason: null,
          payoutAttempts: { increment: 1 },
        },
      });
      released += 1;
    } catch (err) {
      const reason = err instanceof Error ? err.message.slice(0, 500) : "Unknown error";
      await prisma.booking.update({
        where: { id: booking.id },
        data: {
          payoutStatus: "RELEASE_FAILED",
          payoutFailureReason: reason,
          payoutAttempts: { increment: 1 },
        },
      });
      logger.error({ err, bookingId: booking.id, provider }, "Payout release failed");
      failed += 1;
    }
  }

  logger.info({ attempted: due.length, released, failed }, "Cron: payout release run complete");
  return { attempted: due.length, released, failed };
}
