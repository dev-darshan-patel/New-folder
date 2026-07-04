import type { Prisma } from "@prisma/client";

export type UsersQuery = {
  q?: string;
  plan?: string;
  hasBookings?: string;
  showDeleted?: string;
  sort?: string;
  dir?: string;
  page?: string;
};

export const SORT_FIELDS = ["createdAt", "businessName", "plan", "bookings"] as const;
export type SortField = (typeof SORT_FIELDS)[number];

export const PAGE_SIZE = 20;

export function parseUsersQuery(sp: UsersQuery) {
  const q = (sp.q ?? "").trim();
  // Any plan id is accepted as a filter; an unknown id simply matches no rows.
  const plan = (sp.plan ?? "").trim() || null;
  const hasBookings = sp.hasBookings === "1";
  const showDeleted = sp.showDeleted === "1";
  const sort: SortField = SORT_FIELDS.includes(sp.sort as SortField)
    ? (sp.sort as SortField)
    : "createdAt";
  const dir: "asc" | "desc" = sp.dir === "asc" ? "asc" : "desc";
  const page = Math.max(1, Number(sp.page) || 1);
  return { q, plan, hasBookings, showDeleted, sort, dir, page };
}

export function buildUserWhere(parsed: ReturnType<typeof parseUsersQuery>): Prisma.UserWhereInput {
  const where: Prisma.UserWhereInput = {};
  if (parsed.q) {
    where.OR = [
      { businessName: { contains: parsed.q } },
      { email: { contains: parsed.q } },
      { slug: { contains: parsed.q } },
      { name: { contains: parsed.q } },
    ];
  }
  if (parsed.plan) where.plan = parsed.plan;
  if (parsed.hasBookings) where.bookings = { some: {} };
  if (!parsed.showDeleted) where.deletedAt = null;
  return where;
}

export function buildUserOrderBy(
  parsed: ReturnType<typeof parseUsersQuery>,
): Prisma.UserOrderByWithRelationInput {
  if (parsed.sort === "bookings") {
    return { bookings: { _count: parsed.dir } };
  }
  return { [parsed.sort]: parsed.dir };
}
