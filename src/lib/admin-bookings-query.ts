import type { Prisma, BookingStatus } from "@prisma/client";

export type BookingsQuery = {
  q?: string;
  status?: string;
  businessId?: string;
  dateFrom?: string;
  dateTo?: string;
  sort?: string;
  dir?: string;
  page?: string;
};

export const SORT_FIELDS = ["startTime", "createdAt"] as const;
export type SortField = (typeof SORT_FIELDS)[number];

export const PAGE_SIZE = 25;

export function parseBookingsQuery(sp: BookingsQuery) {
  const q = (sp.q ?? "").trim();
  const status = (["CONFIRMED", "CANCELLED"] as BookingStatus[]).includes(
    sp.status as BookingStatus,
  )
    ? (sp.status as BookingStatus)
    : null;
  const businessId = (sp.businessId ?? "").trim() || null;
  const dateFrom = sp.dateFrom ? new Date(`${sp.dateFrom}T00:00:00.000Z`) : null;
  const dateTo = sp.dateTo ? new Date(`${sp.dateTo}T23:59:59.999Z`) : null;
  const sort: SortField = SORT_FIELDS.includes(sp.sort as SortField)
    ? (sp.sort as SortField)
    : "startTime";
  const dir: "asc" | "desc" = sp.dir === "asc" ? "asc" : "desc";
  const page = Math.max(1, Number(sp.page) || 1);
  return {
    q,
    status,
    businessId,
    dateFrom: dateFrom && !Number.isNaN(dateFrom.getTime()) ? dateFrom : null,
    dateTo: dateTo && !Number.isNaN(dateTo.getTime()) ? dateTo : null,
    sort,
    dir,
    page,
  };
}

type Parsed = ReturnType<typeof parseBookingsQuery>;

// `includeStatus` lets the stats panel reuse the same date/business/search
// filters while always seeing the full status breakdown.
export function buildBookingWhere(
  parsed: Parsed,
  opts: { includeStatus?: boolean } = { includeStatus: true },
): Prisma.BookingWhereInput {
  const where: Prisma.BookingWhereInput = {};
  if (parsed.q) {
    where.OR = [
      { inviteeName: { contains: parsed.q } },
      { inviteeEmail: { contains: parsed.q } },
      { user: { businessName: { contains: parsed.q } } },
    ];
  }
  if (opts.includeStatus !== false && parsed.status) where.status = parsed.status;
  if (parsed.businessId) where.userId = parsed.businessId;
  if (parsed.dateFrom || parsed.dateTo) {
    where.startTime = {
      ...(parsed.dateFrom ? { gte: parsed.dateFrom } : {}),
      ...(parsed.dateTo ? { lte: parsed.dateTo } : {}),
    };
  }
  return where;
}

export function buildBookingOrderBy(
  parsed: Parsed,
): Prisma.BookingOrderByWithRelationInput {
  return { [parsed.sort]: parsed.dir };
}
