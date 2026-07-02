-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Booking" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "eventTypeId" TEXT NOT NULL,
    "inviteeName" TEXT NOT NULL,
    "inviteeEmail" TEXT NOT NULL,
    "notes" TEXT,
    "answers" TEXT,
    "startTime" DATETIME NOT NULL,
    "endTime" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "manageToken" TEXT,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "rescheduleCount" INTEGER NOT NULL DEFAULT 0,
    "remind24hSentAt" DATETIME,
    "remind1hSentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Booking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Booking_eventTypeId_fkey" FOREIGN KEY ("eventTypeId") REFERENCES "EventType" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Booking" ("answers", "createdAt", "endTime", "eventTypeId", "id", "inviteeEmail", "inviteeName", "manageToken", "notes", "remind1hSentAt", "remind24hSentAt", "sequence", "startTime", "status", "userId") SELECT "answers", "createdAt", "endTime", "eventTypeId", "id", "inviteeEmail", "inviteeName", "manageToken", "notes", "remind1hSentAt", "remind24hSentAt", "sequence", "startTime", "status", "userId" FROM "Booking";
DROP TABLE "Booking";
ALTER TABLE "new_Booking" RENAME TO "Booking";
CREATE UNIQUE INDEX "Booking_manageToken_key" ON "Booking"("manageToken");
CREATE INDEX "Booking_userId_startTime_idx" ON "Booking"("userId", "startTime");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
