# Backups and restore

A backup you have never restored is a hope, not a backup. This covers what to
copy, how to put it back, and how to check it actually works — plus the one
thing that, if lost, makes some of your data permanently unreadable even with
a perfect database dump.

## What has to be backed up

Three separate things. A database dump alone is **not** a complete backup.

| # | What | Where it lives | If you lose it |
|---|------|----------------|----------------|
| 1 | Database | Postgres | Everything: accounts, bookings, tickets, payments |
| 2 | Uploaded files | `public/uploads/` (local disk) or your S3/Blob bucket | Avatars, logos, ticket artwork 404 — the app still runs |
| 3 | `ENCRYPTION_KEY` | `.env` | **See the warning below.** Some DB columns become permanently unreadable |

### The `ENCRYPTION_KEY` warning

`ENCRYPTION_KEY` encrypts sensitive columns at rest (AES-256-GCM — see
`src/lib/crypto.ts`). It is **not** stored in the database, by design: a DB leak
yields ciphertext, not plaintext.

The consequence is that **a database backup is useless on its own** for those
columns. Lose the key and you cannot recover:

- tenant 2FA/TOTP secrets (`src/lib/totp.ts`) — every tenant with 2FA is locked
  out and must be reset manually
- Google Calendar and Zoom OAuth refresh tokens (`src/lib/google-calendar.ts`,
  `src/lib/zoom.ts`) — every connected calendar must be reconnected
- Stripe/Razorpay credentials in platform settings (`src/lib/settings.ts`)

Generating a *new* key does not help — a new key cannot decrypt data written
with the old one. Back the key up **separately from the database**, in a
password manager or secrets vault. Storing it in the same place as the dump
defeats the point of encrypting at rest.

## Postgres

### Managed (Neon, Vercel Postgres, RDS)

These provide point-in-time recovery. Check, in your provider's console:

- that PITR is actually enabled on your plan (on some free tiers it is not)
- the retention window — a 7-day window will not save you from damage noticed
  three weeks later

Providers restore to a **new branch/instance**. That is a feature: restore
beside production, verify, then repoint `DATABASE_URL` — never restore over a
live database as a first move.

Managed PITR is not a reason to skip your own dumps. It protects against
infrastructure failure, not against your account being closed, a billing lapse,
or a provider outage during the incident. Take periodic logical dumps too.

### Dump

```bash
pg_dump --format=custom --no-owner --no-privileges \
  "$DATABASE_URL" > "bookify-$(date +%F-%H%M).dump"
```

Use `DIRECT_URL` if your `DATABASE_URL` goes through a pooler — `pg_dump` wants
an unpooled connection.

Nightly, keeping 14 days:

```bash
# /etc/cron.d/bookify-backup
0 3 * * * bookify BACKUP_DIR=/var/backups/bookify /opt/bookify/scripts/backup.sh
```

```bash
#!/usr/bin/env bash
# /opt/bookify/scripts/backup.sh
set -euo pipefail
BACKUP_DIR="${BACKUP_DIR:-/var/backups/bookify}"
mkdir -p "$BACKUP_DIR"
cd /opt/bookify
set -a; . ./.env; set +a

STAMP="$(date +%F-%H%M)"
pg_dump --format=custom --no-owner --no-privileges \
  "${DIRECT_URL:-$DATABASE_URL}" > "$BACKUP_DIR/db-$STAMP.dump"

# Uploaded files, only when using local-disk storage.
if [ -d public/uploads ]; then
  tar -czf "$BACKUP_DIR/uploads-$STAMP.tar.gz" public/uploads
fi

# Keep 14 days.
find "$BACKUP_DIR" -name 'db-*.dump' -mtime +14 -delete
find "$BACKUP_DIR" -name 'uploads-*.tar.gz' -mtime +14 -delete
```

Make it executable (`chmod +x`) and owned by the app user.

**Get the dumps off the machine.** A backup on the same disk as the database
does not survive the failure most likely to destroy it. Sync to object storage
or another host:

```bash
rclone sync /var/backups/bookify remote:bookify-backups
```

## Uploaded files

Depends on your storage provider (`/admin/settings/storage`):

- **Local disk** — files are in `public/uploads/`. Covered by the script above.
- **S3-compatible** — enable bucket versioning; consider cross-region
  replication. Versioning is what protects you from a bad delete, which
  replication alone does not.
- **Vercel Blob** — managed; verify what your plan actually retains.

Losing files is survivable — the app runs, images 404. Do not let that make you
skip it; a tenant losing their uploaded ticket artwork is still a real incident.

## Restore

Restore into a **new, empty database first**, never over production.

```bash
createdb bookify_restore
pg_restore --no-owner --no-privileges -d bookify_restore bookify-2026-08-30-0300.dump
```

Point a non-production copy of the app at it:

```bash
DATABASE_URL=postgres://.../bookify_restore \
DIRECT_URL=postgres://.../bookify_restore \
ENCRYPTION_KEY=<the key that was in use when the dump was taken> \
npm run start
```

Then restore files:

```bash
tar -xzf uploads-2026-08-30-0300.tar.gz -C /opt/bookify
```

Only once you have confirmed the copy is good, repoint production.

### After restoring

- **Do not run `prisma migrate`** against a restored dump expecting it to fix a
  version mismatch. Restore a dump into the app version it was taken from. If
  you must move forward, restore first, verify, then upgrade normally.
- Payment webhooks that arrived after the dump are lost. Reconcile
  `/admin/payments` against the provider dashboard before taking payments again.
- Bookings created after the dump are gone. Their invitees still hold a
  `manageToken` link that will now 404.

## Verify it works — quarterly

The whole point. Put it in a calendar.

1. Take the most recent nightly dump.
2. Restore it into a scratch database, as above.
3. Start the app against it and check:
   - you can log in
   - `/api/health` returns `200`
   - a tenant's bookings and tickets are present
   - a ticket page renders its QR
   - **a tenant with 2FA can still sign in** — this is the check that proves
     your `ENCRYPTION_KEY` backup is the right one. Everything else can look
     perfect with the wrong key.
4. Drop the scratch database.

If step 3 fails, you have found it on a Tuesday afternoon rather than during an
outage.

## What is not covered

- Provider-side data (Stripe/Razorpay records, emails already sent) lives with
  those providers and is not in your dump.
- The reminder cron does not resend anything on restore. Reminders whose
  `remind*SentAt` was recorded in a lost window will not re-fire.
