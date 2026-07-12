-- Feature 4.2: Provider abstraction. Tenant's currently active provider +
-- platform-side Razorpay credentials + platform config for the eligibility
-- matrix and fee.

ALTER TABLE "User" ADD COLUMN "activePaymentProvider" TEXT;

ALTER TABLE "PlatformSettings" ADD COLUMN "razorpayMode" TEXT NOT NULL DEFAULT 'TEST';
ALTER TABLE "PlatformSettings" ADD COLUMN "razorpayTestKeyId" TEXT;
ALTER TABLE "PlatformSettings" ADD COLUMN "razorpayTestKeySecret" TEXT;
ALTER TABLE "PlatformSettings" ADD COLUMN "razorpayTestWebhookSecret" TEXT;
ALTER TABLE "PlatformSettings" ADD COLUMN "razorpayLiveKeyId" TEXT;
ALTER TABLE "PlatformSettings" ADD COLUMN "razorpayLiveKeySecret" TEXT;
ALTER TABLE "PlatformSettings" ADD COLUMN "razorpayLiveWebhookSecret" TEXT;
ALTER TABLE "PlatformSettings" ADD COLUMN "stripeForIndiaEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PlatformSettings" ADD COLUMN "paymentFeePercent" DOUBLE PRECISION NOT NULL DEFAULT 0;
