-- Feature 4.3: Provider onboarding. Per-provider linked-account ids + a ready
-- boolean tracking whether hosted onboarding actually finished.

ALTER TABLE "User" ADD COLUMN "stripeConnectAccountId" TEXT;
ALTER TABLE "User" ADD COLUMN "stripeConnectReady" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "razorpayLinkedAccountId" TEXT;
ALTER TABLE "User" ADD COLUMN "razorpayConnectReady" BOOLEAN NOT NULL DEFAULT false;
