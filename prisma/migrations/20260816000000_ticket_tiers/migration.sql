-- CreateTable
CREATE TABLE "TicketTier" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER,
    "seatsTaken" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketTier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TicketTier_sessionId_idx" ON "TicketTier"("sessionId");

-- AddForeignKey
ALTER TABLE "TicketTier" ADD CONSTRAINT "TicketTier_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN "tierId" TEXT;

-- CreateIndex
CREATE INDEX "Ticket_tierId_idx" ON "Ticket"("tierId");

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "TicketTier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
