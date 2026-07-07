-- AlterTable
ALTER TABLE "User" ADD COLUMN     "deletionRequestedAt" TIMESTAMP(3),
ADD COLUMN     "purgeScheduledAt" TIMESTAMP(3),
ADD COLUMN     "recoveryToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_recoveryToken_key" ON "User"("recoveryToken");
