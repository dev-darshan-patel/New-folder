import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import PlanForm from "../PlanForm";

export default async function EditPlanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const viewer = await getCurrentUser();
  if (!viewer || viewer.adminRole !== "SUPER_ADMIN") {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Plan</h1>
        <p className="mt-2 text-sm text-slate-500">Restricted to Super Admins.</p>
      </div>
    );
  }

  const { id } = await params;
  const [plan, inUse] = await Promise.all([
    prisma.plan.findUnique({ where: { id } }),
    prisma.user.count({ where: { plan: id } }),
  ]);
  if (!plan) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/admin/settings/plans" className="text-sm text-slate-500 hover:text-indigo-600">
        ← All plans
      </Link>

      <div className="mt-3 flex items-center gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{plan.name}</h1>
        {plan.isSystem && <Badge variant="secondary">System</Badge>}
        <Badge variant={plan.active ? "success" : "muted"}>{plan.active ? "Active" : "Hidden"}</Badge>
      </div>
      <p className="mt-1 text-sm text-slate-600">
        <span className="font-mono text-xs">{plan.id}</span> · {inUse} account
        {inUse === 1 ? "" : "s"} on this plan
      </p>

      <div className="mt-6">
        <PlanForm
          mode="edit"
          initial={{
            id: plan.id,
            name: plan.name,
            priceLabel: plan.priceLabel,
            priceMonthly: plan.priceMonthly,
            maxEventTypes: plan.maxEventTypes,
            featureKeys: plan.featureKeys,
            features: plan.features,
            stripePriceId: plan.stripePriceId,
            active: plan.active,
            sortOrder: plan.sortOrder,
            isSystem: plan.isSystem,
          }}
        />
      </div>
    </div>
  );
}
