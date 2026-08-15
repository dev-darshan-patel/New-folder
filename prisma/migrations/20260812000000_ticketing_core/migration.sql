-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('ISSUED', 'CHECKED_IN', 'VOID');

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "unlimited" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ticketsIssued" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "EventType" ADD COLUMN     "issuesTickets" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maxTicketsPerOrder" INTEGER NOT NULL DEFAULT 10;

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "sessionId" TEXT,
    "code" TEXT NOT NULL,
    "serial" INTEGER NOT NULL,
    "attendeeName" TEXT,
    "status" "TicketStatus" NOT NULL DEFAULT 'ISSUED',
    "checkedInAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_code_key" ON "Ticket"("code");

-- CreateIndex
CREATE INDEX "Ticket_bookingId_idx" ON "Ticket"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_sessionId_serial_key" ON "Ticket"("sessionId", "serial");

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;
