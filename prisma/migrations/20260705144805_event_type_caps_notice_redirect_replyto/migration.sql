-- AlterTable
ALTER TABLE "EventType" ADD COLUMN     "confirmationRedirectUrl" TEXT,
ADD COLUMN     "maxPerMonth" INTEGER,
ADD COLUMN     "maxPerWeek" INTEGER,
ADD COLUMN     "minNoticeToCancelMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "replyToEmail" TEXT;
