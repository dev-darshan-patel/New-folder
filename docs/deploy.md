# Deploying to production (Vercel + Neon/Vercel Postgres)

The schema's datasource is now `postgresql` (previously SQLite for zero-config
local dev). **This means `npm run dev` requires a real Postgres connection
string from here on** — SQLite and Postgres can't coexist in one Prisma schema.

## 1. Get a Postgres database (2 minutes, free tier)

Pick one:

- **Vercel Postgres** (powered by Neon): in the Vercel dashboard → your
  project → Storage → Create Database → Postgres. Connecting it to the
  project auto-populates `POSTGRES_PRISMA_URL` and
  `POSTGRES_URL_NON_POOLING` env vars — point `DATABASE_URL` at the former
  and `DIRECT_URL` at the latter (see `.env.example`).
- **Neon directly** (neon.tech): create a project, copy the pooled connection
  string for `DATABASE_URL` and the "direct connection" string for
  `DIRECT_URL` (Neon's dashboard labels this clearly — look for "Connect" →
  toggle "Pooled connection").

Either way you end up with two `postgresql://...` URLs. Put them in `.env`
locally, and as project env vars on Vercel for production.

## 2. Apply the baseline migration

```bash
npx prisma migrate deploy
```

This runs `prisma/migrations/20260702130000_init/migration.sql` — a single
Postgres-native migration generated offline from the current schema (the old
SQLite-era migration files are archived at
`prisma/migrations_sqlite_archive/` for history only; they don't apply to
Postgres and are not part of the active migration chain).

For **local development** going forward, use `npm run db:migrate` (`prisma
migrate dev`) exactly as before — same commands, just against Postgres now
instead of `dev.db`.

## 3. Rotate secrets for production

Generate a fresh `AUTH_SECRET` (don't reuse the dev one):

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

Set it as a Vercel env var. Also set `CRON_SECRET` to a fresh random value —
it protects `/api/cron/reminders`.

## 4. Vercel project env vars checklist

| Var | Notes |
|---|---|
| `DATABASE_URL` | pooled Postgres connection string |
| `DIRECT_URL` | unpooled — required for `prisma migrate` to run |
| `AUTH_SECRET` | fresh random value, production-only |
| `NEXT_PUBLIC_APP_URL` | your real production domain, e.g. `https://yourapp.com` |
| `CRON_SECRET` | fresh random value |
| `SMTP_*` | optional zero-config fallback — email provider is otherwise configured live at `/admin/settings/email` after first deploy |
| `STRIPE_*` | optional zero-config TEST-mode fallback — real config lives at `/admin/settings` (DB-backed, supports TEST/LIVE switch) |

## 5. Cron reminders

`vercel.json` already schedules `/api/cron/reminders` every 10 minutes.
**Vercel Hobby tier only allows daily crons** — if you're not on Pro, see
`docs/reminders-cron.md` for a free external-pinger alternative (cron-job.org,
UptimeRobot, etc.) that works identically.

## 6. First deploy checklist

1. Push to your Git remote, import the repo in Vercel.
2. Add the env vars above (DB vars first — the build runs `prisma generate`
   via `postinstall`, and `next build` doesn't need a live DB connection, but
   the app will 500 on every request without one).
3. After the first successful deploy, run `npx prisma migrate deploy` once
   locally with the production `DATABASE_URL`/`DIRECT_URL` in scope (or via
   Vercel's CLI `vercel env pull` first) to create the schema.
4. Visit `/admin/settings` and `/admin/settings/email` to configure Stripe
   and email provider credentials against the live database — nothing here
   needs a redeploy.
5. Manually promote your own account to admin: connect to the production DB
   (Prisma Studio: `npx prisma studio` with production env vars loaded) and
   set `adminRole = SUPER_ADMIN` on your user row. There's no self-serve path
   for this by design.

## Why SQLite → Postgres, not MySQL

The schema was written to be portable (see the model comments) — Postgres was
chosen because Neon/Vercel Postgres give a genuinely zero-ops free tier with
built-in connection pooling, which is what `directUrl` above is for.
