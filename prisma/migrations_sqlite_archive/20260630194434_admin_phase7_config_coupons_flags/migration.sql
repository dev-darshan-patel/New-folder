-- CreateTable
CREATE TABLE "FeatureFlag" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Coupon" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "grantPlan" TEXT,
    "stripePromotionCodeId" TEXT,
    "maxRedemptions" INTEGER,
    "redemptionCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" DATETIME,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CouponRedemption" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "couponId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "redeemedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CouponRedemption_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CouponRedemption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PlatformSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "stripeMode" TEXT NOT NULL DEFAULT 'TEST',
    "stripeTestPublishableKey" TEXT,
    "stripeTestSecretKey" TEXT,
    "stripeTestWebhookSecret" TEXT,
    "stripeTestPricePro" TEXT,
    "stripeTestPriceBusiness" TEXT,
    "stripeLivePublishableKey" TEXT,
    "stripeLiveSecretKey" TEXT,
    "stripeLiveWebhookSecret" TEXT,
    "stripeLivePricePro" TEXT,
    "stripeLivePriceBusiness" TEXT,
    "googleClientId" TEXT,
    "googleClientSecret" TEXT,
    "microsoftClientId" TEXT,
    "microsoftClientSecret" TEXT,
    "microsoftTenant" TEXT NOT NULL DEFAULT 'common',
    "maintenanceMode" BOOLEAN NOT NULL DEFAULT false,
    "maintenanceMessage" TEXT,
    "signupsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "supportEmail" TEXT,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_PlatformSettings" ("googleClientId", "googleClientSecret", "id", "microsoftClientId", "microsoftClientSecret", "microsoftTenant", "stripeLivePriceBusiness", "stripeLivePricePro", "stripeLivePublishableKey", "stripeLiveSecretKey", "stripeLiveWebhookSecret", "stripeMode", "stripeTestPriceBusiness", "stripeTestPricePro", "stripeTestPublishableKey", "stripeTestSecretKey", "stripeTestWebhookSecret", "updatedAt") SELECT "googleClientId", "googleClientSecret", "id", "microsoftClientId", "microsoftClientSecret", "microsoftTenant", "stripeLivePriceBusiness", "stripeLivePricePro", "stripeLivePublishableKey", "stripeLiveSecretKey", "stripeLiveWebhookSecret", "stripeMode", "stripeTestPriceBusiness", "stripeTestPricePro", "stripeTestPublishableKey", "stripeTestSecretKey", "stripeTestWebhookSecret", "updatedAt" FROM "PlatformSettings";
DROP TABLE "PlatformSettings";
ALTER TABLE "new_PlatformSettings" RENAME TO "PlatformSettings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_code_key" ON "Coupon"("code");

-- CreateIndex
CREATE INDEX "CouponRedemption_userId_idx" ON "CouponRedemption"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CouponRedemption_couponId_userId_key" ON "CouponRedemption"("couponId", "userId");
