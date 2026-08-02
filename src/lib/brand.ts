// The product's accent color, in one place.
//
// This is deliberately a plain hex constant rather than a CSS variable: it is
// consumed in contexts that can't resolve CSS at all — the OG image and apple
// icon are rasterised server-side by Satori, and transactional email HTML has
// to inline real values for mail clients. So TypeScript is the source of truth
// and `--primary` in globals.css mirrors it.
//
// Keep this file free of server-only imports — client components
// (BookingWidget, Charts) import it too.
//
// Changing the brand color means updating this constant AND `--primary` in
// src/app/globals.css. It does NOT change existing tenants' saved brandColor,
// which is their own setting seeded from the Prisma default.
export const BRAND_COLOR = "#4f46e5";

// The platform's own product name — distinct from a tenant's brandColor/
// logoUrl/welcomeMessage above, which are per-tenant settings for their
// booking page. This is the name of the SaaS itself: wordmarks, page titles,
// the favicon letter, calendar PRODID, and default email From-name.
//
// Reads NEXT_PUBLIC_PRODUCT_NAME so a buyer white-labeling this codebase
// only ever edits .env, never this file — every call site here keeps
// working across a `git pull` of upstream fixes with no merge conflict.
// Falls back to "Bookify" (this codebase's own name) when unset.
//
// One caveat that can't be fixed by an env var: TOTP 2FA issuer names
// (src/app/dashboard/settings/security/page.tsx) are baked into an
// authenticator app at enrollment time. Changing this after tenants have
// already enrolled 2FA does not break their codes, but their authenticator
// app keeps showing the OLD name forever for those existing entries — only
// new enrollments see the new one. See REBRANDING.md.
export const PRODUCT_NAME = process.env.NEXT_PUBLIC_PRODUCT_NAME || "Bookify";
