import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensurePlans, getAllPlans } from "@/lib/plans";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { togglePlanActiveAction, deletePlanAction } from "./actions";
import PlanForm from "./PlanForm";

export default async function AdminPlansPage() {
  const viewer = await getCurrentUser();
  if (!viewer || viewer.adminRole !== "SUPER_ADMIN") {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Plans</h1>
        <p className="mt-2 text-sm text-slate-500">Restricted to Super Admins.</p>
      </div>
    );
  }

  await ensurePlans();
  const plans = await getAllPlans();

  // Count accounts per plan so we can warn before deletion.
  const counts = await prisma.user.groupBy({ by: ["plan"], _count: { _all: true } });
  const countByPlan = new Map(counts.map((c) => [c.plan, c._count._all]));

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Plans</h1>
      <p className="mt-1 text-sm text-slate-600">
        Create, edit, and retire subscription tiers. Prices, limits, and feature gates apply
        across the app. FREE is a system plan and can&apos;t be deleted.
      </p>

      <div className="mt-6 space-y-3">
        {plans.map((p) => {
          const inUse = countByPlan.get(p.id) ?? 0;
          return (
            <Card key={p.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/admin/settings/plans/${p.id}`}
                      className="font-medium text-slate-900 hover:text-indigo-600 hover:underline"
                    >
                      {p.name}
                    </Link>
                    <span className="font-mono text-xs text-slate-400">{p.id}</span>
                    {p.isSystem && <Badge variant="secondary">System</Badge>}
                    <Badge variant={p.active ? "success" : "muted"}>
                      {p.active ? "Active" : "Hidden"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    {p.priceLabel} ·{" "}
                    {p.maxEventTypes === null ? "Unlimited" : p.maxEventTypes} event types
                    {p.customBranding ? " · Branding" : ""}
                    {p.teamScheduling ? " · Team" : ""} · {inUse} account{inUse === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {!p.isSystem && (
                    <form action={togglePlanActiveAction}>
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="active" value={(!p.active).toString()} />
                      <Button type="submit" variant="outline" size="sm">
                        {p.active ? "Hide" : "Show"}
                      </Button>
                    </form>
                  )}
                  <Link
                    href={`/admin/settings/plans/${p.id}`}
                    className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
                  >
                    Edit
                  </Link>
                  {!p.isSystem && inUse === 0 && (
                    <form action={deletePlanAction}>
                      <input type="hidden" name="id" value={p.id} />
                      <Button
                        type="submit"
                        variant="outline"
                        size="sm"
                        className="border-red-200 text-red-600 hover:bg-red-50"
                      >
                        Delete
                      </Button>
                    </form>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="mt-8">
        <CardContent className="p-5">
          <h2 className="text-sm font-semibold text-slate-900">Create a new plan</h2>
          <p className="mt-0.5 mb-4 text-sm text-slate-600">
            Add a new tier. It becomes selectable when assigning plans and (if active) appears on
            the billing page.
          </p>
          <PlanForm
            mode="create"
            initial={{
              id: "",
              name: "",
              priceLabel: "",
              priceMonthly: 0,
              maxEventTypes: null,
              customBranding: false,
              teamScheduling: false,
              features: [],
              stripePriceId: null,
              active: true,
              sortOrder: plans.length,
              isSystem: false,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
