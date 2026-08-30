-- AlterTable
ALTER TABLE "PlatformSettings" ADD COLUMN "termsContent" TEXT,
ADD COLUMN "privacyContent" TEXT,
ADD COLUMN "termsUpdatedAt" TIMESTAMP(3),
ADD COLUMN "privacyUpdatedAt" TIMESTAMP(3);
