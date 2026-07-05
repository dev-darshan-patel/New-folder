-- AlterEnum
ALTER TYPE "BookingStatus" ADD VALUE 'PENDING';

-- AlterEnum
ALTER TYPE "LocationType" ADD VALUE 'ZOOM';

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "guests" TEXT,
ADD COLUMN     "meetingProvider" TEXT;

-- AlterTable
ALTER TABLE "EventType" ADD COLUMN     "requiresApproval" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "PlatformSettings" ADD COLUMN     "zoomClientId" TEXT,
ADD COLUMN     "zoomClientSecret" TEXT;
