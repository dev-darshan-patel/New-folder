import "server-only";
import { prisma } from "@/lib/prisma";

// Convert an arbitrary string into a URL-safe slug.
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

// Slugify `base` and append "-2", "-3", etc. until it's unique among User.slug.
export async function uniqueUserSlug(base: string): Promise<string> {
  const root = slugify(base) || "business";
  let candidate = root;
  let n = 1;
  while (await prisma.user.findUnique({ where: { slug: candidate } })) {
    n += 1;
    candidate = `${root}-${n}`;
  }
  return candidate;
}
