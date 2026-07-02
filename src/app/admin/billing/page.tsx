import Link from "next/link";
import { requireAdminRole } from "@/lib/admin-auth";
import {
  getBillingOverview,
  getRecentInvoices,
  type AtRiskRow,
  type InvoiceRow,
} from "@/lib/admin-billing";
import { planConfig } from "@/lib/plans";
import { AdminTable, type Column } from "@/components/admin/AdminTable";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

type MrrRow = { plan: string; count: number; mrr: number };

export default async function AdminBillingPage() {
  try {
    await requireAdminRole("READ_ONLY");
  } catch {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Billing</h1>
        <p className="mt-2 text-sm text-slate-500">Restricted to admins.</p>
      </div>
    );
  }

  const [overview, invoices] = await Promise.all([
    getBillingOverview(),
    getRecentInvoices(),
  ]);

  const mrrRows: MrrRow[] = overview.mrrByPlan.map((r) => ({
    plan: planConfig(r.plan).name,
    count: r.count,
    mrr: r.mrr,
  }));

  const mrrColumns: Column<MrrRow>[] = [
    {
      key: "plan",
      header: "Plan",
      cellClassName: "font-medium text-slate-900",
      render: (r) => r.plan,
    },
    { key: "count", header: "Paid accounts", align: "right", render: (r) => r.count },
    {
      key: "mrr",
      header: "MRR",
      align: "right",
      cellClassName: "text-slate-700",
      render: (r) => `$${r.mrr.toLocaleString()}`,
    },
  ];

  const atRiskColumns: Column<AtRiskRow>[] = [
    {
      key: "business",
      header: "Business",
      render: (u) => (
        <>
          <Link
            href={`/admin/users/${u.id}`}
            className="font-medium text-slate-900 hover:text-indigo-600"
          >
            {u.businessName}
          </Link>
          <div className="text-xs text-slate-400">{u.email}</div>
        </>
      ),
    },
    {
      key: "plan",
      header: "Plan",
      render: (u) => <Badge variant="secondary">{planConfig(u.plan).name}</Badge>,
    },
    {
      key: "status",
      header: "Status",
      render: (u) => (
        <Badge variant={u.subscriptionStatus === "past_due" ? "warning" : "destructive"}>
          {u.subscriptionStatus.replace(/_/g, " ")}
        </Badge>
      ),
    },
    {
      key: "renews",
      header: "Renews",
      cellClassName: "whitespace-nowrap text-slate-700",
      render: (u) => (u.planRenewsAt ? u.planRenewsAt.toLocaleDateString() : "—"),
    },
    {
      key: "stripe",
      header: "Stripe",
      render: (u) =>
        u.stripeCustomerId ? (
          <a
            href={`https://dashboard.stripe.com/customers/${u.stripeCustomerId}`}
            target="_blank"
            className="text-xs text-indigo-500 hover:underline"
          >
            View customer ↗
          </a>
        ) : (
          <span className="text-slate-400">—</span>
        ),
    },
  ];

  const invoiceColumns: Column<InvoiceRow>[] = [
    {
      key: "created",
      header: "Date",
      cellClassName: "whitespace-nowrap text-slate-700",
      render: (i) => i.created.toLocaleDateString(),
    },
    {
      key: "customer",
      header: "Customer",
      cellClassName: "text-slate-700",
      render: (i) => i.customerEmail ?? "—",
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      cellClassName: "text-slate-700",
      render: (i) => `$${i.amountDue.toLocaleString()} ${i.currency}`,
    },
    {
      key: "status",
      header: "Status",
      render: (i) => (
        <Badge
          variant={
            i.status === "paid" ? "success" : i.status === "open" ? "warning" : "secondary"
          }
        >
          {i.status}
        </Badge>
      ),
    },
    {
      key: "link",
      header: "",
      align: "right",
      render: (i) =>
        i.hostedInvoiceUrl ? (
          <a
            href={i.hostedInvoiceUrl}
            target="_blank"
            className="text-xs text-indigo-500 hover:underline"
          >
            View ↗
          </a>
        ) : null,
    },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Billing</h1>
      <p className="mt-1 text-sm text-slate-600">Subscription health across all tenants.</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-4">
        <Stat label="Estimated MRR" value={`$${overview.mrrTotal.toLocaleString()}`} />
        <Stat label="Paid accounts" value={overview.paidCount} />
        <Stat label="At-risk subscriptions" value={overview.atRisk.length} />
        <Stat label="Cancellations (30d)" value={overview.cancelled30d} />
      </div>

      <AdminTable
        title="MRR by plan"
        description="Estimated from current plan assignments."
        tableLabel="MRR by plan"
        rows={mrrRows}
        columns={mrrColumns}
        rowKey={(r) => r.plan}
      />

      <AdminTable
        title="At-risk subscriptions"
        description="Paid accounts in dunning — Stripe reports their subscription as unpaid or past due."
        tableLabel="At-risk subscriptions"
        rows={overview.atRisk}
        columns={atRiskColumns}
        rowKey={(u) => u.id}
        emptyMessage="No at-risk subscriptions — everyone is paying happily."
      />

      {invoices === null ? (
        <Card className="mt-4">
          <CardContent className="p-4 text-sm text-slate-500">
            Stripe is not configured (or unreachable) — invoice history unavailable. Configure it
            at{" "}
            <Link href="/admin/settings" className="text-indigo-500 hover:underline">
              /admin/settings
            </Link>
            .
          </CardContent>
        </Card>
      ) : (
        <AdminTable
          title="Recent invoices"
          description="The 20 most recent invoices across the Stripe account."
          tableLabel="Recent invoices"
          rows={invoices}
          columns={invoiceColumns}
          rowKey={(i) => i.id}
          emptyMessage="No invoices yet."
        />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-slate-500">{label}</p>
        <p className="mt-1 text-xl font-bold text-slate-900">{value}</p>
      </CardContent>
    </Card>
  );
}
