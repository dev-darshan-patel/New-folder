-- Secret token for the read-only iCal subscription feed. Nullable and minted
-- lazily on first use, so existing rows need no backfill.
ALTER TABLE "User" ADD COLUMN "calendarFeedToken" TEXT;
CREATE UNIQUE INDEX "User_calendarFeedToken_key" ON "User"("calendarFeedToken");
