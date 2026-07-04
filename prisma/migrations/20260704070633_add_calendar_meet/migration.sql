-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('IN_PERSON', 'PHONE', 'GOOGLE_MEET');

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "calendarEventId" TEXT,
ADD COLUMN     "meetingUrl" TEXT;

-- AlterTable
ALTER TABLE "EventType" ADD COLUMN     "locationDetail" TEXT,
ADD COLUMN     "locationType" "LocationType" NOT NULL DEFAULT 'IN_PERSON';

-- CreateTable
CREATE TABLE "CalendarConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'google',
    "accountEmail" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "scope" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CalendarConnection_userId_key" ON "CalendarConnection"("userId");

-- AddForeignKey
ALTER TABLE "CalendarConnection" ADD CONSTRAINT "CalendarConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
