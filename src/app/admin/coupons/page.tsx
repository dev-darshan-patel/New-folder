import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { planConfig, PLAN_ORDER } from "@/lib/plans";
import { createCouponAction, toggleCouponAction, deleteCouponAction } from "./actions";
import { AdminTable, type Column } from "@/components/admin/AdminTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type CouponRow = Awaited<ReturnType<typeof prisma.coupon.findMany<{
  include: { _count: { select: { redemptions: true } } };
}>>>[number];

export default async function AdminCouponsPage() {
  const viewer = await getCurrentUser();
  if (!viewer || !viewer.adminRole) {
    return null;
  }

  const canEdit = viewer.adminRole !== "READ_ONLY";
  const canDelete = viewer.adminRole === "SUPER_ADMIN";

  const coupons = await prisma.coupon.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { redemptions: true } } },
  });

  const columns: Column<CouponRow>[] = [
    {
      key: "code",
      header: "Code",
      cellClassName: "font-mono font-medium text-slate-900",
      render: (c) => c.code,
    },
    {
      key: "type",
      header: "Type",
      cellClassName: "text-slate-600",
      render: (c) => (c.type === "TRIAL" ? "Trial" : "Stripe promo"),
    },
    {
      key: "details",
      header: "Details",
      cellClassName: "text-slate-600",
      render: (c) => (
        <>
          {c.description && <p>{c.description}</p>}
          {c.type === "TRIAL" && c.grantPlan && (
            <p>
              {c.value} days on {planConfig(c.grantPlan).name}
            </p>
          )}
          {c.type === "STRIPE_PROMO" && c.stripePromotionCodeId && (
            <p className="font-mono text-xs">{c.stripePromotionCodeId}</p>
          )}
          {c.expiresAt && (
            <p className="text-xs text-slate-400">
              Expires {c.expiresAt.toLocaleString()}
            </p>
          )}
        </>
      ),
    },
    {
      key: "usage",
      header: "Usage",
      cellClassName: "text-slate-600",
      render: (c) => (
        <>
          {c.redemptionCount}
          {c.maxRedemptions != null ? ` / ${c.maxRedemptions}` : ""} total
          <span className="block text-xs text-slate-400">
            {c._count.redemptions} unique users
          </span>
        </>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (c) => (
        <Badge variant={c.active ? "success" : "muted"}>
          {c.active ? "Active" : "Inactive"}
        </Badge>
      ),
    },
  ];

  if (canEdit) {
    columns.push({
      key: "actions",
      header: "Actions",
      render: (c) => (
        <div className="flex flex-wrap gap-2">
          <form action={toggleCouponAction}>
            <input type="hidden" name="id" value={c.id} />
            <input type="hidden" name="active" value={c.active ? "false" : "true"} />
            <Button
              type="submit"
              variant="link"
              size="sm"
              className="h-auto px-0 text-xs"
            >
              {c.active ? "Deactivate" : "Activate"}
            </Button>
          </form>
          {canDelete && (
            <form action={deleteCouponAction}>
              <input type="hidden" name="id" value={c.id} />
              <Button
                type="submit"
                variant="link"
                size="sm"
                className="h-auto px-0 text-xs text-red-600"
              >
                Delete
              </Button>
            </form>
          )}
        </div>
      ),
    });
  }

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Coupons</h1>
      <p className="mt-1 text-sm text-slate-600">
        Promo codes for billing. Trial codes grant a plan without Stripe; Stripe promo codes
        apply a promotion at Checkout.
      </p>

      {canEdit && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Create coupon</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={createCouponAction}>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Code</span>
                  <Input
                    name="code"
                    required
                    placeholder="LAUNCH20"
                    className="mt-1 uppercase"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Type</span>
                  <NativeSelect name="type" required className="mt-1" defaultValue="TRIAL">
                    <option value="TRIAL">Free trial (grant plan for N days)</option>
                    <option value="STRIPE_PROMO">Stripe promotion code</option>
                  </NativeSelect>
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-sm font-medium text-slate-700">Description (optional)</span>
                  <Input name="description" placeholder="Launch week promo" className="mt-1" />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Trial days</span>
                  <Input name="value" type="number" min={1} defaultValue={30} className="mt-1" />
                  <span className="mt-1 block text-xs text-slate-400">For trial coupons only.</span>
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Plan</span>
                  <NativeSelect name="grantPlan" className="mt-1" defaultValue="PRO">
                    <option value="">Any paid plan</option>
                    {PLAN_ORDER.filter((p) => p !== "FREE").map((p) => (
                      <option key={p} value={p}>
                        {planConfig(p).name}
                      </option>
                    ))}
                  </NativeSelect>
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-sm font-medium text-slate-700">Stripe promotion code ID</span>
                  <Input
                    name="stripePromotionCodeId"
                    placeholder="promo_..."
                    className="mt-1"
                  />
                  <span className="mt-1 block text-xs text-slate-400">
                    Required for Stripe promo type — from the Stripe Dashboard.
                  </span>
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Max redemptions</span>
                  <Input name="maxRedemptions" type="number" min={1} placeholder="Unlimited" className="mt-1" />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Expires</span>
                  <Input name="expiresAt" type="datetime-local" className="mt-1" />
                </label>
              </div>
              <Button
                type="submit"
                className="mt-4"
              >
                Create coupon
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <AdminTable
        title="Existing coupons"
        description={`${coupons.length} ${coupons.length === 1 ? "coupon" : "coupons"} configured.`}
        tableLabel="Admin coupons"
        totalRows={coupons.length}
        rows={coupons}
        columns={columns}
        rowKey={(c) => c.id}
        rowClassName="align-top hover:bg-slate-50"
        containerClassName="mt-8 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
        emptyMessage="No coupons yet."
        emptyClassName="px-4 py-8 text-center text-slate-500"
      />
    </div>
  );
}
