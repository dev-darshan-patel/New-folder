import "server-only";
import { prisma } from "@/lib/prisma";
import { RESERVED_SLUGS, isReservedSlug, slugify } from "@/lib/slug-reserved";

export { RESERVED_SLUGS, isReservedSlug, slugify };

// Slugify `base` and append "-2", "-3", etc. until it's not a reserved word
// and not already held by another tenant — either as their live handle or as
// one of their retired aliases. Used by every account-creation path (email
// signup, OAuth signup, admin create), so none of them can mint a reserved or
// colliding slug.
//
// Skipping retired aliases matters: handing a new signup someone else's
// abandoned handle would silently redirect that handle's existing links — and
// all the trust attached to them — to a stranger's booking page.
export async function uniqueUserSlug(base: string): Promise<string> {
  const root = slugify(base) || "business";
  let candidate = root;
  let n = 1;
  while (
    RESERVED_SLUGS.has(candidate) ||
    (await prisma.user.findUnique({ where: { slug: candidate }, select: { id: true } })) ||
    (await prisma.slugAlias.findUnique({ where: { slug: candidate }, select: { slug: true } }))
  ) {
    n += 1;
    candidate = `${root}-${n}`;
  }
  return candidate;
}
