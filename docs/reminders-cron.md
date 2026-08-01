# Booking reminder scheduler

Reminder emails (24h + 1h before a booking) are **pull-based**: nothing fires on its
own. A scheduler must hit `/api/cron/reminders` every few minutes. The endpoint is
idempotent (`remind24hSentAt` / `remind1hSentAt` stamps), so overlapping or repeated
calls are safe.

## Auth

Set `CRON_SECRET` in the environment. The endpoint accepts either:

- `Authorization: Bearer <CRON_SECRET>` header, or
- `?secret=<CRON_SECRET>` query param

If `CRON_SECRET` is unset, the endpoint is open (dev convenience only — always set it
in production).

## Option A — Vercel Cron (configured in `vercel.json`)

`vercel.json` schedules `/api/cron/reminders` once daily (`0 0 * * *`) — that's the
**Hobby**-plan limit, since sub-daily schedules require a Pro plan. Vercel automatically
sends `Authorization: Bearer $CRON_SECRET` when the `CRON_SECRET` env var exists on the
project, so this needs no extra setup. On its own, once a day is too infrequent for the
1-hour reminder window to ever fire correctly — see Option B, which is what's actually
providing the real cadence.

## Option B — GitHub Actions (configured in `.github/workflows/cron-reminders.yml`)

Already wired: a scheduled workflow pings `/api/cron/reminders` every 10 minutes. It
reads two **repository secrets** (Settings → Secrets and variables → Actions):

- `CRON_URL` — the full production URL, e.g. `https://yourdomain.com/api/cron/reminders`.
  Must be `https://` (Vercel 307-redirects `http://`, which the workflow now follows via
  `curl -L`, but pointing at the canonical URL directly avoids the extra hop) and must be
  the project's **primary** domain — a non-canonical alias (e.g. the `*.vercel.app` URL
  when a custom domain is set as primary) also gets redirected.
- `CRON_SECRET` — must match the `CRON_SECRET` env var on the deployed Vercel project.

Both crons calling the same idempotent endpoint is intentional and harmless — repeated
calls just re-check what's already due.

### Alternative: any other external pinger / system cron

```bash
# system crontab, every 5 minutes
*/5 * * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://yourdomain.com/api/cron/reminders
```

Free ping services (cron-job.org, UptimeRobot heartbeat) work the same way — any HTTP
GET/POST with the secret.

## Verifying it works

A successful call returns JSON: `{ "ok": true, "sent24h": n, "sent1h": n }`.
With SMTP unconfigured, sent reminders are logged to the server console instead.
