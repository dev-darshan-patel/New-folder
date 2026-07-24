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
timezone selection, per-event-type intake questions & scheduling limits, email
reminders (24h + 1h, via cron), team scheduling (round-robin / collective),
group & recurring bookings, tenant payments (Stripe / Razorpay), 2FA, a
per-plan feature-entitlement system, self-service account deletion + recovery,
and a full platform super-admin console (`/admin`).

Not built yet: **Google/Outlook calendar sync** beyond the existing Google
busy-sync + Meet-link generation (SMS is intentionally out of scope).

## Local setup

Postgres is required — a free [Neon](https://neon.tech) or Vercel Postgres
database takes ~2 minutes to provision (see [`docs/deploy.md`](docs/deploy.md)).

```bash
npm install                 # postinstall runs `prisma generate`
cp .env.example .env        # fill in DATABASE_URL / DIRECT_URL / AUTH_SECRET
npm run db:migrate          # apply the schema to your database
npm run db:seed             # optional: seed a demo account
npm run dev                 # http://localhost:3000
```

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

- **[docs/PROJECT-GUIDE.html](docs/PROJECT-GUIDE.html)** — the full guide: user,
  admin, and developer sections (open it in a browser).
- **[docs/deploy.md](docs/deploy.md)** — production deployment (Vercel + Neon).
- **[docs/reminders-cron.md](docs/reminders-cron.md)** — the reminder cron setup.
- **[CLAUDE.md](CLAUDE.md)** — architecture notes and conventions.
