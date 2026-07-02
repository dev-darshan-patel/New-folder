import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { AdminTable, type Column } from "@/components/admin/AdminTable";
import { Badge } from "@/components/ui/badge";

const PAGE_SIZE = 30;

function describe(action: string): string {
  return action.replace(/[._]/g, " ");
}

type Entry = Awaited<ReturnType<typeof prisma.adminAuditLog.findMany>>[number];

export default async function AdminAuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);

  const [total, entries] = await Promise.all([
    prisma.adminAuditLog.count(),
    prisma.adminAuditLog.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const columns: Column<Entry>[] = [
    {
      key: "when",
      header: "When",
      cellClassName: "whitespace-nowrap text-slate-500",
      render: (e) => e.createdAt.toLocaleString(),
    },
    {
      key: "actor",
      header: "Actor",
      cellClassName: "text-slate-700",
      render: (e) => e.actorEmail,
    },
    {
      key: "action",
      header: "Action",
      render: (e) => (
        <Badge variant="muted">{describe(e.action)}</Badge>
      ),
    },
    {
      key: "target",
      header: "Target",
      cellClassName: "text-slate-700",
      render: (e) =>
        e.targetUserId ? (
          <Link
            href={`/admin/users/${e.targetUserId}`}
            className="text-indigo-600 hover:underline"
          >
            {e.targetLabel ?? e.targetUserId}
          </Link>
        ) : (
          <span className="text-slate-400">—</span>
        ),
    },
    {
      key: "details",
      header: "Details",
      cellClassName: "text-xs text-slate-500",
      render: (e) => {
        let metadata: Record<string, unknown> | null = null;
        try {
          metadata = e.metadata ? JSON.parse(e.metadata) : null;
        } catch {
          metadata = null;
        }
        return metadata ? JSON.stringify(metadata) : "";
      },
    },
  ];

  return (
    <div className="mx-auto max-w-4xl">
      <AdminTable
        title="Audit log"
        description={`Every admin action, newest first. ${total} total.`}
        tableLabel="Admin audit log"
        totalRows={total}
        pageSize={PAGE_SIZE}
        rows={entries}
        columns={columns}
        rowKey={(e) => e.id}
        rowClassName="align-top hover:bg-slate-50"
        emptyMessage="No admin actions yet."
        pagination={{
          page,
          totalPages,
          buildHref: (p) => `/admin/audit?page=${p}`,
        }}
      />
    </div>
  );
}
