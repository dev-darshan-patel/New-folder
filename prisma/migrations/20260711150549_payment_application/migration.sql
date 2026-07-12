-- Feature 4.1: Tenant payment-application + admin approval gate.

ALTER TABLE "User" ADD COLUMN "country" TEXT;
ALTER TABLE "User" ADD COLUMN "paymentAccountStatus" TEXT NOT NULL DEFAULT 'NONE';

CREATE TABLE "PaymentApplication" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "businessDescription" TEXT NOT NULL,
    "expectedPriceRange" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedByEmail" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentApplication_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PaymentApplication_userId_idx" ON "PaymentApplication"("userId");
CREATE INDEX "PaymentApplication_status_idx" ON "PaymentApplication"("status");
CREATE INDEX "PaymentApplication_createdAt_idx" ON "PaymentApplication"("createdAt");

ALTER TABLE "PaymentApplication" ADD CONSTRAINT "PaymentApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
