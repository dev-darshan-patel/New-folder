-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "googleId" TEXT,
    "microsoftId" TEXT,
    "name" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "adminRole" TEXT,
    "suspended" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" DATETIME,
    "passwordResetToken" TEXT,
    "passwordResetExpiresAt" DATETIME,
    "mobile" TEXT,
    "totpSecret" TEXT,
    "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "totpBackupCodes" TEXT,
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
INSERT INTO "new_User" ("adminRole", "brandColor", "brandFont", "businessName", "createdAt", "deletedAt", "email", "googleId", "id", "isAdmin", "logoUrl", "microsoftId", "name", "passwordHash", "passwordResetExpiresAt", "passwordResetToken", "plan", "planRenewsAt", "slug", "stripeCustomerId", "stripeSubscriptionId", "subscriptionStatus", "suspended", "timezone", "updatedAt", "welcomeMessage") SELECT "adminRole", "brandColor", "brandFont", "businessName", "createdAt", "deletedAt", "email", "googleId", "id", "isAdmin", "logoUrl", "microsoftId", "name", "passwordHash", "passwordResetExpiresAt", "passwordResetToken", "plan", "planRenewsAt", "slug", "stripeCustomerId", "stripeSubscriptionId", "subscriptionStatus", "suspended", "timezone", "updatedAt", "welcomeMessage" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");
CREATE UNIQUE INDEX "User_microsoftId_key" ON "User"("microsoftId");
CREATE UNIQUE INDEX "User_slug_key" ON "User"("slug");
CREATE UNIQUE INDEX "User_passwordResetToken_key" ON "User"("passwordResetToken");
CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User"("stripeCustomerId");
CREATE UNIQUE INDEX "User_stripeSubscriptionId_key" ON "User"("stripeSubscriptionId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
