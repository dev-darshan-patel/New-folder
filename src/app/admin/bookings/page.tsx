import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  parseBookingsQuery,
  buildBookingWhere,
  buildBookingOrderBy,
  PAGE_SIZE,
  type BookingsQuery,
} from "@/lib/admin-bookings-query";
import { setSuspendedAction } from "../actions";
import { AdminTable, type Column } from "@/components/admin/AdminTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Card, CardContent } from "@/components/ui/card";

function qs(params: Record<string, string | number | undefined>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") usp.set(k, String(v));
  }
  const s = usp.toString();
  return s ? `?${s}` : "";
}

type BookingRow = Awaited<ReturnType<typeof prisma.booking.findMany<{
  include: {
    eventType: true;
    teamMember: { select: { name: true } };
    user: { select: { businessName: true; slug: true; suspended: true } };
  };
}>>>[number];

export default async function AdminBookings({
  searchParams,
}: {
  searchParams: Promise<BookingsQuery>;
}) {
  const sp = await searchParams;
  const parsed = parseBookingsQuery(sp);
  const listWhere = buildBookingWhere(parsed);
  const statsWhere = buildBookingWhere(parsed, { includeStatus: false });
  const orderBy = buildBookingOrderBy(parsed);
  const now = new Date();

  const [total, bookings, statsTotal, statsCancelled, statsRescheduled, statsUpcoming, businesses] =
    await Promise.all([
      prisma.booking.count({ where: listWhere }),
      prisma.booking.findMany({
        where: listWhere,
        orderBy,
        skip: (parsed.page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: { eventType: true, teamMember: { select: { name: true } }, user: { select: { businessName: true, slug: true, suspended: true } } },
      }),
      prisma.booking.count({ where: statsWhere }),
      prisma.booking.count({ where: { ...statsWhere, status: "CANCELLED" } }),
      prisma.booking.count({ where: { ...statsWhere, rescheduleCount: { gt: 0 } } }),
      prisma.booking.count({ where: { ...statsWhere, status: "CONFIRMED", startTime: { gte: now } } }),
      prisma.user.findMany({ select: { id: true, businessName: true }, orderBy: { businessName: "asc" } }),
    ]);

  const cancellationRate = statsTotal ? (statsCancelled / statsTotal) * 100 : 0;
  const rescheduleRate = statsTotal ? (statsRescheduled / statsTotal) * 100 : 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const baseParams = {
    q: parsed.q,
    status: parsed.status ?? undefined,
    businessId: parsed.businessId ?? undefined,
    dateFrom: sp.dateFrom,
    dateTo: sp.dateTo,
    sort: parsed.sort,
    dir: parsed.dir,
  };

  const columns: Column<BookingRow>[] = [
    {
      key: "startTime",
      header: "When",
      sortable: true,
      cellClassName: "whitespace-nowrap text-slate-700",
      render: (b) => (
        <>
          {b.startTime.toLocaleString()}
          {b.rescheduleCount > 0 && (
            <span className="ml-1 text-xs text-amber-600">↻ rescheduled</span>
          )}
        </>
      ),
    },
    {
      key: "business",
      header: "Business",
      render: (b) => (
        <>
          <Link
            href={`/admin/users/${b.userId}`}
            className="font-medium text-slate-900 hover:text-indigo-600"
          >
            {b.user.businessName}
          </Link>
          <div>
            <a
              href={`/${b.user.slug}`}
              target="_blank"
              className="text-xs text-indigo-500 hover:underline"
            >
              View public page ↗
            </a>
          </div>
        </>
      ),
    },
    {
      key: "invitee",
      header: "Invitee",
      cellClassName: "text-slate-700",
      render: (b) => (
        <>
          {b.inviteeName}
          <div className="text-xs text-slate-400">{b.inviteeEmail}</div>
        </>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (b) => (
        <Badge variant={b.status === "CANCELLED" ? "destructive" : "success"}>
          {b.status === "CANCELLED" ? "Canceled" : "Confirmed"}
        </Badge>
      ),
    },
    {
      key: "with",
      header: "With",
      cellClassName: "text-slate-500",
      render: (b) => b.teamMember?.name ?? "—",
    },
    {
      key: "moderation",
      header: "Moderation",
      render: (b) =>
        b.user.suspended ? (
          <Badge variant="warning">Business suspended</Badge>
        ) : (
          <form action={setSuspendedAction}>
            <input type="hidden" name="userId" value={b.userId} />
            <input type="hidden" name="suspended" value="1" />
            <Button variant="link" size="sm" className="h-auto px-0 text-xs text-red-600">
              Suspend business
            </Button>
          </form>
        ),
    },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      {/* Stats (reflect search/business/date filters, ignore status filter) */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="In scope" value={statsTotal} />
        <Stat label="Cancellation rate" value={`${cancellationRate.toFixed(0)}%`} sub={`${statsCancelled} canceled`} />
        <Stat label="Reschedule rate" value={`${rescheduleRate.toFixed(0)}%`} sub={`${statsRescheduled} rescheduled`} />
        <Stat label="Upcoming" value={statsUpcoming} />
      </div>

      <AdminTable
        title="Bookings"
        description={`Every booking across every business. ${total} matching.`}
        actions={
          <Button asChild variant="outline" size="sm">
            <a href={`/admin/bookings/export${qs(baseParams)}`}>Export CSV</a>
          </Button>
        }
        filters={
          <form method="GET" className="flex flex-wrap items-end gap-3">
            <Field label="Search">
              <Input
                name="q"
                defaultValue={parsed.q}
                placeholder="Invitee, email, business…"
                className="w-56"
              />
            </Field>
            <Field label="Status">
              <NativeSelect
                name="status"
                defaultValue={parsed.status ?? ""}
              >
                <option value="">All</option>
                <option value="CONFIRMED">Confirmed</option>
                <option value="PENDING">Pending approval</option>
                <option value="CANCELLED">Canceled</option>
              </NativeSelect>
            </Field>
            <Field label="Business">
              <NativeSelect
                name="businessId"
                defaultValue={parsed.businessId ?? ""}
                className="max-w-[12rem]"
              >
                <option value="">All businesses</option>
                {businesses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.businessName}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="From">
              <Input
                type="date"
                name="dateFrom"
                defaultValue={sp.dateFrom ?? ""}
              />
            </Field>
            <Field label="To">
              <Input
                type="date"
                name="dateTo"
                defaultValue={sp.dateTo ?? ""}
              />
            </Field>
            <Button type="submit">
              Apply
            </Button>
            {(parsed.q || parsed.status || parsed.businessId || sp.dateFrom || sp.dateTo) && (
              <Link href="/admin/bookings" className="text-sm text-slate-500 hover:text-slate-900">
                Clear
              </Link>
            )}
          </form>
        }
        tableLabel="Admin bookings"
        totalRows={total}
        pageSize={PAGE_SIZE}
        rows={bookings}
        columns={columns}
        rowKey={(b) => b.id}
        sort={{ field: parsed.sort, dir: parsed.dir }}
        sortHref={(field, dir) =>
          `/admin/bookings${qs({ ...baseParams, sort: field, dir, page: 1 })}`
        }
        emptyMessage="No bookings match these filters."
        pagination={{
          page: parsed.page,
          totalPages,
          buildHref: (p) => `/admin/bookings${qs({ ...baseParams, page: p })}`,
        }}
      />
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-slate-500">{label}</p>
        <p className="mt-1 text-xl font-bold text-slate-900">{value}</p>
        {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}
