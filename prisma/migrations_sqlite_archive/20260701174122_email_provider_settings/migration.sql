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
    "emailProvider" TEXT NOT NULL DEFAULT 'NONE',
    "gmailSmtpUser" TEXT,
    "gmailSmtpPass" TEXT,
    "gmailSmtpFrom" TEXT,
    "sesSmtpUser" TEXT,
    "sesSmtpPass" TEXT,
    "sesRegion" TEXT,
    "sesFromAddress" TEXT,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_PlatformSettings" ("googleClientId", "googleClientSecret", "id", "maintenanceMessage", "maintenanceMode", "microsoftClientId", "microsoftClientSecret", "microsoftTenant", "signupsEnabled", "stripeLivePriceBusiness", "stripeLivePricePro", "stripeLivePublishableKey", "stripeLiveSecretKey", "stripeLiveWebhookSecret", "stripeMode", "stripeTestPriceBusiness", "stripeTestPricePro", "stripeTestPublishableKey", "stripeTestSecretKey", "stripeTestWebhookSecret", "supportEmail", "updatedAt") SELECT "googleClientId", "googleClientSecret", "id", "maintenanceMessage", "maintenanceMode", "microsoftClientId", "microsoftClientSecret", "microsoftTenant", "signupsEnabled", "stripeLivePriceBusiness", "stripeLivePricePro", "stripeLivePublishableKey", "stripeLiveSecretKey", "stripeLiveWebhookSecret", "stripeMode", "stripeTestPriceBusiness", "stripeTestPricePro", "stripeTestPublishableKey", "stripeTestSecretKey", "stripeTestWebhookSecret", "supportEmail", "updatedAt" FROM "PlatformSettings";
DROP TABLE "PlatformSettings";
ALTER TABLE "new_PlatformSettings" RENAME TO "PlatformSettings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
