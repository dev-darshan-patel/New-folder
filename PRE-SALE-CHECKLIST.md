# Pre-sale / handover checklist

Run this in full before **every** handover — a new buyer, a demo repo, a
marketplace submission. Don't rely on memory of having done it last time;
re-run the commands, they're cheap.

## 1. Delivery method

**Transfer via `git clone` / GitHub repo transfer. Never zip the working
folder and send that.**

The working directory contains files that are gitignored for exactly this
reason — `.env` (live secrets), `.env.local`, `prisma/dev.db` (a real SQLite
file with real names in it from local testing), `.vercel/`, `.next/`,
`node_modules/`, `.remember/`, `graphify-out/`, `.claude/settings.local.json`.
None of these are tracked by git, so a `git clone` never includes them — but
a folder zip sweeps up everything present on disk, secrets included.

Verify this before every handover, don't assume it still holds:

```bash
# What actually gets cloned. If any of the files above appear, stop.
git clone --depth 1 https://github.com/dev-darshan-patel/New-folder.git /tmp/handover-check
ls -la /tmp/handover-check    # should NOT contain .env, dev.db, node_modules, etc.
rm -rf /tmp/handover-check
```

Tested 2026-08-02: clean — the clone contains only tracked files, none of the
forbidden ones above.

## 2. No secrets in git history

Verified clean as of 2026-08-02 — re-run before every sale, since it only
takes one accidental `git add -A` to change that:

```bash
for pat in "sk_live_" "sk_test_" "rzp_live_" "postgres://" "postgresql://" "AIza" "-----BEGIN"; do
  echo "=== $pat ==="
  git grep -I -l "$pat" $(git rev-list --all) 2>/dev/null
done
```

Any hit needs manual review — a placeholder (`.env.example`, a UI
`placeholder="sk_live_..."` string) is fine; a real value is not. If a real
secret is ever found in history, rotating the secret is not enough — the
history itself must be rewritten (`git filter-repo` or BFG) before the repo
is ever shared again.

## 3. No personal identifiers in source

```bash
grep -rli "darshan\|karaniqonic\|gmits" src prisma docs public README.md CLAUDE.md AGENTS.md 2>/dev/null
```

Should return nothing (`prisma/dev.db` may match — that's the gitignored
local file from #1, not shipped code). Extend this list if you've since
added other personal identifiers (your name, email, company name) anywhere
in code comments, sample data, or docs.

## 4. Demo/seed data is fictional

`npm run db:seed` creates `Demo Owner` / `Demo Salon` / `demo@demo.com` — all
fictional, safe to ship and safe for a buyer to see in your own demo
deployment. If you add other seed scripts later, re-verify they don't pull
from real data.

## 5. Your own production data never ships

Your live deployment (`bookify-me.vercel.app` at time of writing) has real
tenants and real bookings. **A code sale transfers the codebase, not the
database.** Never hand over `DATABASE_URL`/`DIRECT_URL` pointing at your
production Neon instance, and never let a buyer's fresh install seed from a
copy of it. If a buyer specifically wants your existing users/bookings as
part of the deal, that's a separate, explicit data-transfer agreement — not
something that happens by default via the repo.

## 6. Secrets the buyer must generate fresh — never hand over yours

None of these should ever be given to a buyer as-is; each is a "generate
your own" line in the README/deploy docs, not a value you supply:

- `AUTH_SECRET`, `ENCRYPTION_KEY`, `CRON_SECRET` — all attacker-facing if reused
- `DATABASE_URL` / `DIRECT_URL` — your own DB, not theirs
- `STRIPE_SECRET_KEY` and anything configured live at `/admin/settings` (Stripe/Razorpay/SMTP/OAuth credentials) — your business credentials
- If you ever shared this folder before today's `.env`/`.env.example` split,
  treat `AUTH_SECRET`, `ENCRYPTION_KEY`, `CRON_SECRET`, and the SMTP password
  as **compromised and due for rotation**, regardless of what git history
  says — a shared folder isn't git history, and this checklist can't verify
  what left your machine outside of git.

## 7. Legal

- [ ] `LICENSE` exists and matches the deal actually being made (single-use /
      tiered / resale terms — see Phase 0)
- [ ] Buyer has agreed to the licence terms *before* repo access is granted,
      not after

## 8. Final gate

- [ ] `npx tsc --noEmit`, `npm run lint`, `npm run build` all clean
- [ ] Version bumped in `package.json` / `CHANGELOG.md` updated (once those exist)
- [ ] You've personally done the clean-clone install test recently (see
      Phase 3) — not "it should work," but "it worked, I watched it happen"
