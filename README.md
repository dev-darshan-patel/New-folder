# Bookify

A multi-tenant, Calendly-style appointment-booking SaaS for small businesses. A
business owner signs up, sets their weekly availability and "event types", and
shares a public booking link (`/{businessSlug}/{eventSlug}`) where their
customers self-book a time slot — no back-and-forth email.

Built with **Next.js 16 (App Router), React 19, Prisma + PostgreSQL, and
Tailwind CSS 4.** Everything is server-first: data is read directly in server
components and mutations go through server actions (there is intentionally no
REST/tRPC layer).

## What's built

Core booking flow, Stripe subscription billing, self-service reschedule/cancel,
custom branding + an embeddable widget, `.ics` calendar invites, invitee
timezone selection, per-event-type intake questions & scheduling limits
(min-notice, daily/weekly/monthly caps, buffer between meetings, booking
window), unlisted event types, event-type cloning, email reminders (24h + 1h,
via cron), a read-only iCal subscription feed, a real dashboard overview with
metrics, team scheduling (round-robin / collective), group & recurring
bookings, tenant payments (Stripe / Razorpay), 2FA, a per-plan
feature-entitlement system, self-service account deletion + recovery, and a
full platform super-admin console (`/admin`).

Not built yet: **Google/Outlook calendar sync** beyond the existing Google
busy-sync + Meet-link generation (SMS is intentionally out of scope).

## Quick start

Postgres is required — a free [Neon](https://neon.tech) or Vercel Postgres
database takes ~2 minutes to provision (see [`docs/deploy.md`](docs/deploy.md)).

```bash
npm install                 # postinstall runs `prisma generate`
cp .env.example .env        # fill in DATABASE_URL / DIRECT_URL / AUTH_SECRET
npm run db:migrate          # apply the schema to your database
npm run db:seed             # optional: seed a demo account (demo@demo.com / password123)
npm run dev                 # http://localhost:3000
```

Verified end-to-end against a fresh clone on 2026-08-02: `npm install` →
`.env` setup → `db:migrate` → `db:seed` → `dev` → log in as the seeded demo
account, with zero manual workarounds needed beyond what's below.

**If `db:migrate`, `db:seed`, or `dev` hangs with no output on a first run**,
it's Prisma's outbound telemetry ping — some networks (corporate proxies,
VPNs) block or stall it for minutes with no error message. Add
`CHECKPOINT_DISABLE=1` to your environment (or prefix any of those commands
with it) to skip the check entirely.

Before committing, `npx tsc --noEmit` (type-check) and `npm run build` (full
build, also type-checks) are the two checks worth running.

## Commands

| Command | Does |
|---|---|
| `npm run dev` | Dev server on `localhost:3000` (Turbopack) |
| `npm run build` | Production build (also runs TypeScript checks) |
| `npm run lint` | ESLint |
| `npm run db:migrate` | `prisma migrate dev` — create/apply a migration locally |
| `npm run db:deploy` | `prisma migrate deploy` — apply pending migrations in production |
| `npm run db:seed` | Seed a demo account |
| `npm run db:studio` | Prisma Studio GUI |

## Documentation

- **[public/PROJECT-GUIDE.html](public/PROJECT-GUIDE.html)** — the User &amp; Admin
  Guide: running a business on Bookify, and operating the platform. Lives in
  `public/` so the running app serves it at `/PROJECT-GUIDE.html` (linked from
  the dashboard and admin nav); open the file directly in a browser to read it
  offline.
- **[public/DEVELOPER-GUIDE.html](public/DEVELOPER-GUIDE.html)** — architecture,
  conventions, data model and deployment, for anyone extending the codebase.
  Served at `/DEVELOPER-GUIDE.html`; cross-linked with the User Guide above.
- **[docs/deploy.md](docs/deploy.md)** — production deployment (Vercel + Neon).
- **[docs/reminders-cron.md](docs/reminders-cron.md)** — the reminder cron setup.
- **[REBRANDING.md](REBRANDING.md)** — white-labeling the product name/logo for a client.
- **[CLAUDE.md](CLAUDE.md)** — architecture notes and conventions.

## License

This is commercially licensed software, not open source — see
**[LICENSE.md](LICENSE.md)** for the full terms. In short: one licence
covers one production deployment, redistribution/resale of the source is not
permitted, and a fixed support/update window is included with each purchase.
