-- Allow an owner to connect more than one calendar/video provider
-- (e.g. Google Calendar AND Zoom) by relaxing the one-connection-per-user
-- constraint to one-per-(user, provider).
DROP INDEX "CalendarConnection_userId_key";
CREATE UNIQUE INDEX "CalendarConnection_userId_provider_key" ON "CalendarConnection"("userId", "provider");
