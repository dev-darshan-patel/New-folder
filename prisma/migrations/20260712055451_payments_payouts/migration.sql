-- Feature 4.6: Escrow release. Payout tracking lives alongside paymentStatus
-- because they're independent axes — the customer's money can be REFUNDED
-- while the payout was still HELD, and reversed after RELEASED.

ALTER TABLE "Booking" ADD COLUMN "payoutStatus" TEXT;
ALTER TABLE "Booking" ADD COLUMN "transferId" TEXT;
ALTER TABLE "Booking" ADD COLUMN "releasedAt" TIMESTAMP(3);
ALTER TABLE "Booking" ADD COLUMN "platformFeeCents" INTEGER;
ALTER TABLE "Booking" ADD COLUMN "payoutFailureReason" TEXT;
ALTER TABLE "Booking" ADD COLUMN "payoutAttempts" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "Booking_payoutStatus_idx" ON "Booking"("payoutStatus");
