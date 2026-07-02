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

Already wired: `vercel.json` schedules `/api/cron/reminders` every 10 minutes.
Vercel automatically sends `Authorization: Bearer $CRON_SECRET` when the
`CRON_SECRET` env var exists on the project — no extra setup beyond adding the env var.

> Note: the Vercel **Hobby** plan only allows once-per-day crons. The `*/10` schedule
> requires a Pro plan. On Hobby, use Option B instead.

## Option B — any external pinger / system cron

```bash
# system crontab, every 5 minutes
*/5 * * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://yourdomain.com/api/cron/reminders
```

Free ping services (cron-job.org, UptimeRobot heartbeat, GitHub Actions `schedule`)
work the same way — any HTTP GET/POST with the secret.

## Verifying it works

A successful call returns JSON: `{ "ok": true, "sent24h": n, "sent1h": n }`.
With SMTP unconfigured, sent reminders are logged to the server console instead.
