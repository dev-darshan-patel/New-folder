import "server-only";
import { prisma } from "@/lib/prisma";

// Handles that must never be assigned as a business slug. Two categories:
//  1. Real top-level routes — a booking page here would be shadowed by the
//     static route (Next.js resolves static segments before dynamic [slug]),
//     leaving the tenant with a broken public page.
//  2. Confusing/technical tokens that look like errors or system pages.
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

// Slugify `base` and append "-2", "-3", etc. until it's both unique among
// User.slug AND not a reserved word. Used by every account-creation path
// (email signup, OAuth signup, admin create), so none of them can ever mint a
// reserved or colliding slug.
export async function uniqueUserSlug(base: string): Promise<string> {
  const root = slugify(base) || "business";
  let candidate = root;
  let n = 1;
  while (
    RESERVED_SLUGS.has(candidate) ||
    (await prisma.user.findUnique({ where: { slug: candidate } }))
  ) {
    n += 1;
    candidate = `${root}-${n}`;
  }
  return candidate;
}
