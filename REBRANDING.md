# White-labeling this codebase

Everything the platform itself is called — wordmarks, page titles, the
favicon letter, the OG share image, the calendar feed's `PRODID`, and the
default email From-name — is driven by one env var. This is separate from
**tenant branding** (`brandColor`/`logoUrl`/`welcomeMessage` on `User`, edited
at `/dashboard/branding`), which was already fully dynamic and needs no
changes here.

## What's automatic

Set one variable and restart the app:

```bash
NEXT_PUBLIC_PRODUCT_NAME="Your Product Name"
```

That's it for everything listed above — see `src/lib/brand.ts` for the single
`PRODUCT_NAME` constant every one of those call sites reads. Leave it unset
to keep the name "Bookify" (this codebase's own name).

To also change the accent color (the purple), see the comment on
`BRAND_COLOR` in the same file — it's a plain hex constant rather than an env
var because it also has to match `--primary` in `src/app/globals.css`
exactly, so changing it means editing both in one pass, not just `.env`.

To change the logo/wordmark mark beyond the auto-generated "first letter in
a colored box" (`src/app/icon.tsx`, `src/app/apple-icon.tsx`,
`src/app/opengraph-image.tsx`), replace those three files with your own
image or a different `ImageResponse` layout — they're plain Next.js
file-convention routes, not a templating system to work around.

## What needs a one-time manual step

A few things can't follow an env var automatically:

- **`public/PROJECT-GUIDE.html` and `public/DEVELOPER-GUIDE.html`** — these
  are static, hand-written reference docs (not rendered from `PRODUCT_NAME`
  at request time). Find-and-replace "Bookify" in both after picking your
  name. There's no other branding text in them beyond the product name
  itself.
- **TOTP 2FA issuer name** — `dashboard/settings/security/page.tsx` already
  reads `PRODUCT_NAME`, so every *new* 2FA enrollment shows your new name
  correctly. But the issuer name is baked into an authenticator app at the
  moment someone scans the QR code — it is **not** re-read later. Any tenant
  who enrolled 2FA before you renamed the product keeps seeing the OLD name
  in their authenticator app forever (their codes still work fine; only the
  displayed label is stale). If you're renaming before any real tenant has
  used 2FA, this doesn't matter. If tenants already have, there's no way to
  retroactively fix already-enrolled entries short of asking them to
  re-enroll.
- **`package.json`'s `"name"` field** (`"bookify"`) — purely an internal npm
  package identifier, never shown to any user. Cosmetic only; change it if
  you want, skip it if you don't care.

## Not part of this

Legal/company identity (LICENSE.md's copyright line, support email
addresses, etc.) is a separate concern from the product's display name —
see `LICENSE.md` and `PRE-SALE-CHECKLIST.md` for those.
