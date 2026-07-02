-- CreateTable
CREATE TABLE "PlatformSettings" (
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
    "updatedAt" DATETIME NOT NULL
);
