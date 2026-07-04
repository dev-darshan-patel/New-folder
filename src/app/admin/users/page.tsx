import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getPlanMap, getAllPlans } from "@/lib/plans";
import {
  parseUsersQuery,
  buildUserWhere,
  buildUserOrderBy,
  PAGE_SIZE,
  type UsersQuery,
} from "@/lib/admin-users-query";
import { AdminTable, type Column } from "@/components/admin/AdminTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

function qs(params: Record<string, string | number | undefined>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") usp.set(k, String(v));
  }
  const s = usp.toString();
  return s ? `?${s}` : "";
}

type UserRow = Awaited<ReturnType<typeof prisma.user.findMany<{
  include: { _count: { select: { eventTypes: true; bookings: true } } };
}>>>[number];

export default async function AdminUsers({
  searchParams,
}: {
  searchParams: Promise<UsersQuery>;
}) {
  const sp = await searchParams;
  const parsed = parseUsersQuery(sp);
  const where = buildUserWhere(parsed);
  const orderBy = buildUserOrderBy(parsed);

  const viewer = await getCurrentUser();
  const canCreate = viewer?.adminRole === "SUPER_ADMIN";

  const [total, users, planMap, allPlans] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy,
      skip: (parsed.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { _count: { select: { eventTypes: true, bookings: true } } },
    }),
    getPlanMap(),
    getAllPlans(),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const baseParams = {
    q: parsed.q,
    plan: parsed.plan ?? undefined,
    hasBookings: parsed.hasBookings ? "1" : undefined,
    showDeleted: parsed.showDeleted ? "1" : undefined,
    sort: parsed.sort,
    dir: parsed.dir,
  };

  const columns: Column<UserRow>[] = [
    {
      key: "businessName",
      header: "Business",
      sortable: true,
      render: (u) => (
        <>
          <div className="flex items-center gap-2">
            <Link
              href={`/admin/users/${u.id}`}
              className="font-medium text-slate-900 hover:text-indigo-600"
            >
              {u.businessName}
            </Link>
            {u.deletedAt && (
              <Badge variant="destructive">Deleted</Badge>
            )}
            {u.suspended && !u.deletedAt && (
              <Badge variant="warning">Suspended</Badge>
            )}
          </div>
          <div className="text-xs text-slate-400">{u.email}</div>
        </>
      ),
    },
    {
      key: "plan",
      header: "Plan",
      sortable: true,
      render: (u) => (
        <Badge variant={u.plan === "FREE" ? "muted" : "default"}>
          {planMap.get(u.plan)?.name ?? u.plan}
        </Badge>
      ),
    },
    {
      key: "mobile",
      header: "Phone",
      align: "right",
      cellClassName: "text-slate-700",
      render: (u) => u.mobile ?? "—",
    },
    {
      key: "subscriptionStatus",
      header: "Status",
      align: "right",
      cellClassName: "text-slate-500",
      render: (u) => u.subscriptionStatus ?? "—",
    },
    {
      key: "eventTypes",
      header: "Event types",
      align: "right",
      cellClassName: "text-slate-700",
      render: (u) => u._count.eventTypes,
    },
    {
      key: "bookings",
      header: "Bookings",
      align: "right",
      sortable: true,
      cellClassName: "text-slate-700",
      render: (u) => u._count.bookings,
    },
    {
      key: "createdAt",
      header: "Joined",
      sortable: true,
      cellClassName: "text-slate-500",
      render: (u) => u.createdAt.toLocaleDateString(),
    },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <AdminTable
        title="Users"
        description={`${total} ${total === 1 ? "account" : "accounts"} matching.`}
        actions={
          <>
            {canCreate && (
              <Button asChild size="sm">
                <Link href="/admin/users/new">+ New user</Link>
              </Button>
            )}
            <Button asChild variant="outline" size="sm">
              <a href={`/admin/users/export${qs({ q: parsed.q, plan: parsed.plan ?? undefined, hasBookings: parsed.hasBookings ? "1" : undefined, showDeleted: parsed.showDeleted ? "1" : undefined })}`}>
                Export CSV
              </a>
            </Button>
          </>
        }
        filters={
          <form method="GET" className="flex flex-wrap items-center gap-3">
            <Input
              name="q"
              defaultValue={parsed.q}
              placeholder="Search business, email, slug…"
              className="w-64"
            />
            <NativeSelect
              name="plan"
              defaultValue={parsed.plan ?? ""}
            >
              <option value="">All plans</option>
              {allPlans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </NativeSelect>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                name="hasBookings"
                value="1"
                defaultChecked={parsed.hasBookings}
                className="h-4 w-4 rounded border-slate-300"
              />
              Has bookings
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                name="showDeleted"
                value="1"
                defaultChecked={parsed.showDeleted}
                className="h-4 w-4 rounded border-slate-300"
              />
              Show deleted
            </label>
            <Button type="submit">
              Apply
            </Button>
            {(parsed.q || parsed.plan || parsed.hasBookings || parsed.showDeleted) && (
              <Link href="/admin/users" className="text-sm text-slate-500 hover:text-slate-900">
                Clear
              </Link>
            )}
          </form>
        }
        tableLabel="Admin users"
        totalRows={total}
        pageSize={PAGE_SIZE}
        rows={users}
        columns={columns}
        rowKey={(u) => u.id}
        sort={{ field: parsed.sort, dir: parsed.dir }}
        sortHref={(field, dir) =>
          `/admin/users${qs({ ...baseParams, sort: field, dir, page: 1 })}`
        }
        emptyMessage="No users match these filters."
        pagination={{
          page: parsed.page,
          totalPages,
          buildHref: (p) => `/admin/users${qs({ ...baseParams, page: p })}`,
        }}
      />
    </div>
  );
}
