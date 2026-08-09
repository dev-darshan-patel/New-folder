import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";

// Resolve a handle from the public URL to the tenant's CURRENT handle.
//
// Returns null when nothing owns the handle (the caller should 404), the same
// string back when it's a live handle, or the tenant's current handle when the
// requested one is a retired alias — in which case the caller should redirect
// rather than render.
//
// KNOWN LIMITATION: the public pages stream, so by the time the redirect fires
// the 200 status line has already been sent and Next can only deliver the
// redirect in the RSC payload. Browsers (and iframes) follow it correctly —
// that covers the case this feature exists for, someone clicking an old link.
// Crawlers and link-preview bots that don't execute the payload will see a
// 200 instead of a 308. The same applies to notFound() on these routes, which
// has always returned 200 for the same reason. Making it a true HTTP 308 means
// doing the lookup in middleware, before rendering starts — deliberately not
// done here: this project has no middleware, and it would put a database query
// in front of every request to serve crawlers rather than users.
//
// Suspended and soft-deleted tenants are deliberately NOT resolved here: the
// caller's existing checks already 404 them, and redirecting to a handle that
// then 404s anyway would just be a slower dead end.
// Request-cached: the public pages call this from both generateMetadata and
// the component body, and both would otherwise hit the database separately.
export const resolveSlug = cache(async (slug: string): Promise<string | null> => {
  const live = await prisma.user.findUnique({ where: { slug }, select: { slug: true } });
  if (live) return live.slug;

  const alias = await prisma.slugAlias.findUnique({
    where: { slug },
    select: { user: { select: { slug: true } } },
  });
  return alias?.user.slug ?? null;
});

// True if `slug` is currently held by any tenant OTHER than `excludeUserId`,
// either as their live handle or as one of their retired aliases.
//
// The alias half matters as much as the live half: letting a new tenant claim
// someone else's abandoned handle would silently hand them every link, QR code
// and search result that still trusts it — a traffic-hijack and phishing
// vector, not just a broken redirect.
export async function isSlugTakenByAnother(
  slug: string,
  excludeUserId?: string,
): Promise<boolean> {
  const [liveOwner, aliasOwner] = await Promise.all([
    prisma.user.findUnique({ where: { slug }, select: { id: true } }),
    prisma.slugAlias.findUnique({ where: { slug }, select: { userId: true } }),
  ]);
  if (liveOwner && liveOwner.id !== excludeUserId) return true;
  if (aliasOwner && aliasOwner.userId !== excludeUserId) return true;
  return false;
}

// Move a tenant to a new handle, preserving the old one as an alias so
// existing links keep working. Atomic: the rename and the alias bookkeeping
// either both land or neither does, so a failure can't leave a handle
// unreachable with no redirect behind it.
//
// If the tenant is moving BACK to a handle they previously retired, that alias
// is consumed rather than left pointing at itself.
export async function renameUserSlug(userId: string, currentSlug: string, nextSlug: string) {
  if (currentSlug === nextSlug) return;

  await prisma.$transaction([
    // Reclaim the target handle if it's one of this tenant's own old aliases.
    prisma.slugAlias.deleteMany({ where: { slug: nextSlug, userId } }),
    prisma.user.update({ where: { id: userId }, data: { slug: nextSlug } }),
    // Retire the outgoing handle. upsert (not create) because the same handle
    // may already be recorded from an earlier rename in a longer chain.
    prisma.slugAlias.upsert({
      where: { slug: currentSlug },
      create: { slug: currentSlug, userId },
      update: { userId },
    }),
  ]);
}
