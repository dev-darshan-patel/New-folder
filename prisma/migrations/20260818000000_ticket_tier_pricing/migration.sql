-- AlterTable
ALTER TABLE "TicketTier" ADD COLUMN "priceCents" INTEGER;

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN "ticketQty" INTEGER,
ADD COLUMN "ticketTierId" TEXT,
ADD COLUMN "ticketAttendeeNames" TEXT;

-- CreateIndex
CREATE INDEX "Booking_ticketTierId_idx" ON "Booking"("ticketTierId");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_ticketTierId_fkey" FOREIGN KEY ("ticketTierId") REFERENCES "TicketTier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
