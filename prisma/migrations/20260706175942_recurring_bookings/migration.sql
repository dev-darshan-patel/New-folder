-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "seriesId" TEXT,
ADD COLUMN     "seriesIndex" INTEGER,
ADD COLUMN     "seriesTotal" INTEGER;

-- AlterTable
ALTER TABLE "EventType" ADD COLUMN     "allowRecurring" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Booking_seriesId_idx" ON "Booking"("seriesId");
