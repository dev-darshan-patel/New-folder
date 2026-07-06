-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "sessionId" TEXT;

-- AlterTable
ALTER TABLE "EventType" ADD COLUMN     "capacity" INTEGER;

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "eventTypeId" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "capacity" INTEGER NOT NULL,
    "seatsTaken" INTEGER NOT NULL DEFAULT 0,
    "meetingUrl" TEXT,
    "meetingProvider" TEXT,
    "calendarEventId" TEXT,
    "cancelled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Session_eventTypeId_startTime_idx" ON "Session"("eventTypeId", "startTime");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_eventTypeId_fkey" FOREIGN KEY ("eventTypeId") REFERENCES "EventType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;
