import "server-only";
import { prisma } from "@/lib/prisma";
import { RESERVED_SLUGS, isReservedSlug, slugify } from "@/lib/slug-reserved";

export { RESERVED_SLUGS, isReservedSlug, slugify };

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
