-- Owner opt-out for Google Calendar busy-time sync; defaults to on.
ALTER TABLE "CalendarConnection" ADD COLUMN "syncBusyTimes" BOOLEAN NOT NULL DEFAULT true;
