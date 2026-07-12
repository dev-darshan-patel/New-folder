-- Feature 4.4: Paid bookings. priceCents null = free (unchanged behavior);
-- currency is derived from the tenant's active provider and stored per event
-- type so provider switches don't re-denominate historical prices.

ALTER TABLE "EventType" ADD COLUMN "priceCents" INTEGER;
ALTER TABLE "EventType" ADD COLUMN "currency" TEXT;
