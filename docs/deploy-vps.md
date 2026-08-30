# Deploying to your own Linux server (Ubuntu / Debian VPS)

The alternative to [`deploy.md`](deploy.md), which covers Vercel. Nothing in
this codebase is Vercel-specific — `vercel.json` only declares a cron schedule
and is ignored everywhere else — so it runs anywhere Node does.

Two things genuinely work *better* here than on Vercel:

- **Uploaded files persist.** Vercel's filesystem is ephemeral, which is why
  the local-disk storage fallback is dev-only there. On a VPS the disk is
  real, so it's a legitimate production option (with one caveat — see §7).
- **Cron can run as often as you like.** Vercel's Hobby tier caps `vercel.json`
  crons at once daily, which is too coarse for the 1-hour reminder window to
  ever fire correctly. A system timer solves that properly (§8).

What you take on instead: process supervision, TLS, and OS updates.

---

## 1. Server requirements

| | |
|---|---|
| RAM | **2 GB minimum.** `next build` can be OOM-killed on a 1 GB box. If you're stuck with 1 GB, add swap or build elsewhere and copy the repo — but see the Prisma warning in §3. |
| Node | **≥ 24.15.0** — see below. This is not negotiable. |
| Disk | A few GB. `node_modules` alone is ~1 GB. |

### Node version — the trap that will bite you

`package.json` pins `"node": ">=24.15.0"` for a real reason: older Node has a
`TransformStream` race ([nodejs/node#62040](https://github.com/nodejs/node/issues/62040))
that breaks React Server Component streaming. The failure mode is nasty —
**server actions hang** instead of erroring, so the app looks alive while every
form silently stops working.

Ubuntu's own repositories ship a much older Node (24.04 LTS ships Node 18), so
**`apt install nodejs` gives you a broken app.** Use NodeSource:

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
node -v    # must print v24.15.0 or higher before you continue
```

---

## 2. Database

Either works:

- **Managed (Neon, etc.)** — exactly as in `deploy.md`. Reachable from any
  server; nothing changes.
- **Postgres on the same box** — `sudo apt install postgresql`, create a
  database and user, then point **both** `DATABASE_URL` and `DIRECT_URL` at
  it. The pooled/direct split exists for serverless connection limits you no
  longer have, so the same URL in both is fine here.

---

## 3. Get the code onto the server

```bash
sudo adduser --system --group --home /srv/bookify bookify
sudo -u bookify -H git clone <your-repo-url> /srv/bookify/app
cd /srv/bookify/app
sudo -u bookify -H npm ci
```

> **Run `npm ci` on the server — never copy `node_modules` from your laptop.**
> Prisma generates a platform-specific query engine binary. A Windows or macOS
> build will not run on Linux. `npm ci` triggers `postinstall`, which runs
> `prisma generate` and produces the correct binary automatically.

`npm ci` (not `npm install`) installs exactly the lockfile and fails instead of
silently changing it.

---

## 4. Environment

`.env` is gitignored, so it does **not** arrive with the clone. Create it:

```bash
sudo -u bookify -H cp .env.example .env
sudo -u bookify -H nano .env
sudo chmod 600 .env          # it holds every secret the app has
```

Generate fresh production secrets — never reuse development values:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"  # AUTH_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"     # ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"     # CRON_SECRET
```

Minimum set:

| Var | Notes |
|---|---|
| `DATABASE_URL` / `DIRECT_URL` | §2. Both may be the same URL for a local Postgres. |
| `AUTH_SECRET` | Signs session JWTs. |
| `ENCRYPTION_KEY` | **Required in production** — the app refuses to store secrets in plaintext without it. **Back it up outside the database.** Lose it and every already-encrypted row is unrecoverable; a new key does not decrypt old rows. |
| `NEXT_PUBLIC_APP_URL` | Your real `https://` domain. Used to build booking links and email content — get this right or every link you email out is wrong. |
| `CRON_SECRET` | Protects the cron endpoints (§8). |

Everything else — Stripe/Razorpay, email delivery, sign-in providers, file
storage — is configured in the admin console after first boot, not here.

---

## 5. Migrate and build

```bash
sudo -u bookify -H npm run db:deploy    # prisma migrate deploy
sudo -u bookify -H npm run build
```

`build` also runs the `prebuild` reserved-slug check, so a route/handle
collision fails the build rather than shipping a dead booking page.

Sanity-check before wiring up systemd:

```bash
sudo -u bookify -H npm start            # serves on :3000
curl -I http://localhost:3000/login     # expect 200
```

---

## 6. Run it under systemd

`/etc/systemd/system/bookify.service`:

```ini
[Unit]
Description=Bookify
After=network.target
# Add postgresql.service to After= as well if the DB is on this box.

[Service]
Type=simple
User=bookify
Group=bookify
WorkingDirectory=/srv/bookify/app
Environment=NODE_ENV=production
Environment=PORT=3000
# next start reads .env from WorkingDirectory itself — no EnvironmentFile needed.
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5

# Hardening. ReadWritePaths is what lets local-disk uploads work (§7); drop it
# if you're using S3 or Vercel Blob.
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/srv/bookify/app/.next /srv/bookify/app/public/uploads

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now bookify
sudo systemctl status bookify
journalctl -u bookify -f        # logs (pino JSON)
```

---

## 7. File storage

Avatar uploads have three backends, chosen at `/admin/settings/storage` (or by
env var — see `.env.example`). On a VPS:

- **Local disk works**, unlike on Vercel — the filesystem persists. Files land
  in `public/uploads/`. This is the zero-config default.
- **The caveat:** `public/uploads/` lives *inside the repo*. If you ever deploy
  by cloning fresh into a new directory, those files are left behind in the old
  one. Either always deploy in place (§10), or use S3.
- **S3 / S3-compatible** (AWS S3, Cloudflare R2, DigitalOcean Spaces, Backblaze
  B2, or self-hosted MinIO) sidesteps that entirely and is the better choice if
  you ever run more than one app server. Configure it at
  `/admin/settings/storage` — no redeploy needed.

---

## 8. Cron

**Nothing in the app triggers these on its own.** Without a scheduler,
reminders never send and account deletions never progress.

Two endpoints, both authenticated with `CRON_SECRET` via either
`Authorization: Bearer <secret>` or `?secret=<secret>`:

| Endpoint | Does | Frequency |
|---|---|---|
| `/api/cron/reminders` | 24h + 1h reminder emails, plus payment-hold expiry, payout release, rate-limit cleanup | every few minutes |
| `/api/cron/account-deletion` | Runs the deletion cascade after the grace period, and purges past the recovery window | hourly or daily |

`sudo crontab -e`:

```cron
*/5 * * * * curl -fsS -m 60 -H "Authorization: Bearer YOUR_CRON_SECRET" https://yourdomain.com/api/cron/reminders >/dev/null
17 * * * * curl -fsS -m 120 -H "Authorization: Bearer YOUR_CRON_SECRET" https://yourdomain.com/api/cron/account-deletion >/dev/null
```

Use your **real public HTTPS domain**, not `localhost` — hitting the app
directly bypasses the proxy, and a stale or wrong URL here is exactly the
failure mode that has bitten this project before (see `docs/reminders-cron.md`).

You can now **delete `vercel.json` and `.github/workflows/cron-reminders.yml`**
if you're not also deploying to Vercel — both exist only to work around the
Hobby-tier daily cron cap.

---

## 9. Reverse proxy and TLS

HTTPS is **not optional**: `next.config.ts` sends HSTS in production, session
cookies assume a secure context, and Google/Microsoft/Zoom OAuth all require
`https://` redirect URIs.

Caddy is the least effort — it obtains and renews certificates automatically.
`/etc/caddy/Caddyfile`:

```caddyfile
yourdomain.com {
    reverse_proxy localhost:3000
}
```

Or nginx + certbot:

```nginx
server {
    server_name yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        # Avatar uploads are capped at 5 MB server-side; nginx defaults to 1 MB.
        client_max_body_size 6m;
    }
}
```

```bash
sudo certbot --nginx -d yourdomain.com
```

Then make sure only 22/80/443 are reachable — port 3000 should not be public:

```bash
sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw enable
```

---

## 10. First-run setup

1. Visit `https://yourdomain.com` and sign up.
2. **Promote yourself to admin** — there's no self-serve path, by design. From
   the app directory: `sudo -u bookify -H npm run db:studio`, open the `User`
   table, set `adminRole` to `SUPER_ADMIN` on your row. (Studio binds to
   localhost; reach it over an SSH tunnel rather than opening a port.)
3. In `/admin`: configure **email first** — until it's set, the app only logs
   emails to the journal, so no verification or booking emails reach anyone.
   This is the most common "why is nothing working" cause.
4. Then payment credentials, plans, and storage as needed.
5. Set an **error alert email** under `/admin/settings/platform` (see below).
6. Publish **Terms** and **Privacy** under `/admin/settings/legal` — until you do,
   `/terms` and `/privacy` say so plainly.
7. Set up **[backups](backup-restore.md)** and
   **[email authentication](email-deliverability.md)**. Both are launch
   blockers rather than later polish: unauthenticated mail lands in spam, and a
   backup you have not restored is not a backup.

## 11. Monitoring

Two things, because "the server is up" and "the app is working" are different
questions and you want to be told about both.

### Uptime

`GET /api/health` returns `200` when the app can reach the database, `503`
when it can't. It deliberately checks Postgres rather than just answering —
a process that responds while its database is unreachable serves errors on
every real page, and a health check that stays green through that actively
suppresses the alert you needed. It's public and returns nothing sensitive,
so point any external monitor at it:

```
https://yourdomain.com/api/health
```

Free options: UptimeRobot, Better Stack, Healthchecks.io. Any of them will
email/SMS you when it starts failing. `HEAD` works too if your monitor
prefers it. **Monitor from OUTSIDE the server** — a check running on the same
box can't tell you the box is down.

### Errors

Server errors are captured to the database and listed at `/admin/errors`,
grouped by cause with an occurrence count, rather than only going to the
journal where nobody reads them. Set **Error alert email** in
`/admin/settings/platform` and you'll be emailed the first time a new error
appears — and again if one you marked resolved comes back. It deliberately
does not email on every occurrence; that's how alerting becomes noise people
filter away.

This needs working email (section 4). Without it, errors are still recorded
at `/admin/errors`, but nobody gets told.

Old errors are pruned automatically by the same cron as section 8, so the
table stays cheap to keep.

## Updating

Deploy in place so `public/uploads/` survives:

```bash
cd /srv/bookify/app
sudo -u bookify -H git pull
sudo -u bookify -H npm ci
sudo -u bookify -H npm run db:deploy
sudo -u bookify -H npm run build
sudo systemctl restart bookify
```

Expect a few seconds of downtime on restart. For zero-downtime you'd need two
instances behind the proxy — out of scope here.

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| Forms/buttons hang forever, no error | Node too old. `node -v` must be ≥ 24.15.0 (§1). |
| `PrismaClientInitializationError` about the query engine | `node_modules` copied from another OS. Delete it and `npm ci` on the server (§3). |
| 500 on every page | `DATABASE_URL` wrong or Postgres unreachable. `journalctl -u bookify -n 50`. |
| No emails arrive | Email provider not configured at `/admin/settings/email` — check the journal, the message body is logged there instead. |
| Emails send but land in spam | SPF/DKIM/DMARC not set up — see [email-deliverability.md](email-deliverability.md). |
| Emails only reach your own address | Amazon SES is still sandboxed; request production access. |
| Reminders never send | Cron not set up, or `CRON_SECRET` mismatch. Run the curl by hand: 200 = fine, 401 = wrong secret. |
| Booking links point at the wrong host | `NEXT_PUBLIC_APP_URL` is wrong. Fix it, then `npm run build` **and** restart — it's baked in at build time. |
| Upload fails with a storage error | Local disk: systemd `ReadWritePaths` missing `public/uploads` (§6). S3: test it at `/admin/settings/storage`. |
| Build killed with no message | Out of memory. Add swap or use a 2 GB box (§1). |

---

### A note on what's verified here

The application-level facts — the Node floor and why, the required env vars,
the two cron endpoints and their auth, the storage backends, that `npm start`
serves on :3000 — are taken from the code in this repository, not from memory.
The systemd unit, nginx/Caddy and ufw snippets are standard configurations
written for this app's specifics but **not executed against a live Ubuntu host
as part of writing this doc**; treat them as a tested-shape starting point and
verify on your own server.
