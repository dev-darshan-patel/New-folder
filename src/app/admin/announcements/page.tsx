import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  createAnnouncementAction,
  setAnnouncementActiveAction,
  deleteAnnouncementAction,
} from "./actions";
import { AdminTable, type Column } from "@/components/admin/AdminTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type AnnouncementRow = Awaited<
  ReturnType<typeof prisma.announcement.findMany>
>[number];

const LEVEL_BADGE: Record<string, string> = {
  INFO: "bg-slate-100 text-slate-700",
  WARNING: "bg-amber-100 text-amber-700",
  CRITICAL: "bg-red-100 text-red-700",
};

export default async function AdminAnnouncementsPage() {
  const viewer = await getCurrentUser();
  if (!viewer || !viewer.adminRole) {
    return null;
  }

  const canEdit = viewer.adminRole === "SUPER_ADMIN";
  const now = new Date();

  const announcements = await prisma.announcement.findMany({
    orderBy: { createdAt: "desc" },
  });

  const columns: Column<AnnouncementRow>[] = [
    {
      key: "message",
      header: "Message",
      cellClassName: "text-slate-900",
      render: (a) =>
        a.message.length > 80 ? `${a.message.slice(0, 80)}…` : a.message,
    },
    {
      key: "level",
      header: "Level",
      render: (a) => (
        <Badge
          variant="muted"
          className={LEVEL_BADGE[a.level] ?? LEVEL_BADGE.INFO}
        >
          {a.level}
        </Badge>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (a) => {
        const expired = a.expiresAt != null && a.expiresAt < now;
        if (!a.active) return <Badge variant="muted">Inactive</Badge>;
        if (expired) return <Badge variant="muted">Expired</Badge>;
        return <Badge variant="success">Active</Badge>;
      },
    },
    {
      key: "created",
      header: "Created",
      cellClassName: "text-slate-600",
      render: (a) => (
        <>
          {a.createdAt.toLocaleDateString()}
          <span className="block text-xs text-slate-400">{a.createdBy}</span>
          {a.expiresAt && (
            <span className="block text-xs text-slate-400">
              Expires {a.expiresAt.toLocaleString()}
            </span>
          )}
        </>
      ),
    },
  ];

  if (canEdit) {
    columns.push({
      key: "actions",
      header: "Actions",
      render: (a) => (
        <div className="flex flex-wrap gap-2">
          <form action={setAnnouncementActiveAction}>
            <input type="hidden" name="id" value={a.id} />
            <input type="hidden" name="active" value={a.active ? "0" : "1"} />
            <Button
              type="submit"
              variant="link"
              size="sm"
              className="h-auto px-0 text-xs"
            >
              {a.active ? "Deactivate" : "Activate"}
            </Button>
          </form>
          <form action={deleteAnnouncementAction}>
            <input type="hidden" name="id" value={a.id} />
            <Button
              type="submit"
              variant="link"
              size="sm"
              className="h-auto px-0 text-xs text-red-600"
            >
              Delete
            </Button>
          </form>
        </div>
      ),
    });
  }

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">
        Announcements
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        Banners shown to every business in their dashboard.
      </p>

      {canEdit && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Create announcement</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={createAnnouncementAction}>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className="text-sm font-medium text-slate-700">Message</span>
                  <Textarea
                    name="message"
                    required
                    rows={3}
                    placeholder="Scheduled maintenance this Sunday 02:00–04:00 UTC."
                    className="mt-1"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Level</span>
                  <NativeSelect name="level" required className="mt-1" defaultValue="INFO">
                    <option value="INFO">Info</option>
                    <option value="WARNING">Warning</option>
                    <option value="CRITICAL">Critical</option>
                  </NativeSelect>
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">
                    Expires (optional)
                  </span>
                  <Input name="expiresAt" type="datetime-local" className="mt-1" />
                  <span className="mt-1 block text-xs text-slate-400">
                    Leave empty to show until deactivated.
                  </span>
                </label>
              </div>
              <Button type="submit" className="mt-4">
                Create announcement
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <AdminTable
        title="All announcements"
        description={`${announcements.length} ${announcements.length === 1 ? "announcement" : "announcements"} total.`}
        tableLabel="Admin announcements"
        totalRows={announcements.length}
        rows={announcements}
        columns={columns}
        rowKey={(a) => a.id}
        rowClassName="align-top hover:bg-slate-50"
        containerClassName="mt-8 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
        emptyMessage="No announcements yet."
        emptyClassName="px-4 py-8 text-center text-slate-500"
      />
    </div>
  );
}
