-- AlterTable
ALTER TABLE "Booking" ADD COLUMN "remind1hSentAt" DATETIME;
ALTER TABLE "Booking" ADD COLUMN "remind24hSentAt" DATETIME;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'FREE',
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "subscriptionStatus" TEXT,
    "planRenewsAt" DATETIME,
    "brandColor" TEXT NOT NULL DEFAULT '#4f46e5',
    "brandFont" TEXT NOT NULL DEFAULT 'Geist',
    "logoUrl" TEXT,
    "welcomeMessage" TEXT
);
INSERT INTO "new_User" ("brandColor", "brandFont", "businessName", "createdAt", "email", "id", "logoUrl", "name", "passwordHash", "plan", "planRenewsAt", "slug", "stripeCustomerId", "stripeSubscriptionId", "subscriptionStatus", "timezone", "updatedAt", "welcomeMessage") SELECT "brandColor", "brandFont", "businessName", "createdAt", "email", "id", "logoUrl", "name", "passwordHash", "plan", "planRenewsAt", "slug", "stripeCustomerId", "stripeSubscriptionId", "subscriptionStatus", "timezone", "updatedAt", "welcomeMessage" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_slug_key" ON "User"("slug");
CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User"("stripeCustomerId");
CREATE UNIQUE INDEX "User_stripeSubscriptionId_key" ON "User"("stripeSubscriptionId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
