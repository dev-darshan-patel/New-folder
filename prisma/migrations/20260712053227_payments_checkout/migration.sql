-- Feature 4.5: Checkout + slot hold. Adds PENDING_PAYMENT to the BookingStatus
-- enum (blocks the slot during checkout) and money-tracking columns on Booking.

ALTER TYPE "BookingStatus" ADD VALUE 'PENDING_PAYMENT';

ALTER TABLE "Booking" ADD COLUMN "paymentProvider" TEXT;
ALTER TABLE "Booking" ADD COLUMN "providerPaymentId" TEXT;
ALTER TABLE "Booking" ADD COLUMN "amountCents" INTEGER;
ALTER TABLE "Booking" ADD COLUMN "currency" TEXT;
ALTER TABLE "Booking" ADD COLUMN "paymentStatus" TEXT;

CREATE INDEX "Booking_providerPaymentId_idx" ON "Booking"("providerPaymentId");
CREATE INDEX "Booking_paymentStatus_idx" ON "Booking"("paymentStatus");
