// Pure slug helpers — no server-only import here on purpose. RESERVED_SLUGS
// and slugify() have zero server dependencies (no DB, no request context),
// so keeping them out of src/lib/slug.ts's "server-only" boundary lets
// tooling like scripts/check-reserved-slugs.ts import them directly in a
// plain Node/tsx process, not just from within a Next.js server context.
// src/lib/slug.ts re-exports everything here, so existing call sites
// (`@/lib/slug`) are unaffected — only uniqueUserSlug(), which genuinely
// touches Prisma, stays behind the server-only guard.

// Handles that must never be assigned as a business slug. Two categories:
//  1. Real top-level routes — a booking page here would be shadowed by the
//     static route (Next.js resolves static segments before dynamic [slug]),
//     leaving the tenant with a broken public page.
//  2. Confusing/technical tokens that look like errors or system pages.
//
// Kept in sync with the actual route tree by scripts/check-reserved-slugs.ts,
// which runs on every `npm run build` (via the `prebuild` script) and fails
// the build if a real route is missing from this set.
export const RESERVED_SLUGS = new Set([
  // --- real routes ---
  "dashboard",
  "login",
  "signup",
  "admin",
  "api",
  "booking",
  "reset-password",
  "forgot-password",
  "verify-email",
  "recover",
  // --- metadata-convention routes ---
  "icon",
  "apple-icon",
  "opengraph-image",
  // --- confusing/technical ---
  "404",
  "500",
  "index",
  "www",
  "null",
  "undefined",
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
  "embed",
]);

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug);
}

// Convert an arbitrary string into a URL-safe slug.
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
