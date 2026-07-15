"use client";

import { useActionState } from "react";
import { createPlanAction, updatePlanAction, type PlanFormState } from "./actions";
import { Button } from "@/components/ui/button";
import { FEATURE_REGISTRY } from "@/lib/features";

type Initial = {
  id: string;
  name: string;
  priceLabel: string;
  priceMonthly: number;
  maxEventTypes: number | null;
  featureKeys: string[];
  features: string[];
  stripePriceId: string | null;
  active: boolean;
  sortOrder: number;
  isSystem: boolean;
};

const field =
  "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";

export default function PlanForm({
  mode,
  initial,
}: {
  mode: "create" | "edit";
  initial: Initial;
}) {
  const action = mode === "create" ? createPlanAction : updatePlanAction;
  const [state, formAction, pending] = useActionState<PlanFormState, FormData>(action, null);

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Plan ID</span>
          {mode === "create" ? (
            <input
              name="id"
              defaultValue={initial.id}
              placeholder="STARTER"
              title="Unique uppercase plan ID"
              className={field}
            />
          ) : (
            <>
              <input type="hidden" name="id" value={initial.id} />
              <input
                value={initial.id}
                disabled
                title="Plan ID (immutable)"
                className={`${field} bg-slate-50 text-slate-500`}
              />
            </>
          )}
          <span className="mt-1 block text-xs text-slate-400">
            {mode === "create"
              ? "Uppercase identifier, can't change later (e.g. STARTER)."
              : "Immutable — it's stored on every account with this plan."}
          </span>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Display name</span>
          <input name="name" defaultValue={initial.name} placeholder="Starter" title="Plan display name" className={field} />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Price label</span>
          <input
            name="priceLabel"
            defaultValue={initial.priceLabel}
            placeholder="$19/mo"
            title="Displayed price label"
            className={field}
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Monthly price (USD)</span>
          <input
            name="priceMonthly"
            type="number"
            min={0}
            defaultValue={initial.priceMonthly}
            disabled={initial.isSystem}
            title="Numeric monthly price for MRR math"
            className={`${field} ${initial.isSystem ? "bg-slate-50 text-slate-500" : ""}`}
          />
          {initial.isSystem && (
            <span className="mt-1 block text-xs text-slate-400">The FREE plan is always $0.</span>
          )}
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Max event types</span>
          <input
            name="maxEventTypes"
            type="number"
            min={0}
            defaultValue={initial.maxEventTypes ?? ""}
            placeholder="Unlimited"
            title="Max active event types (blank = unlimited)"
            className={field}
          />
          <span className="mt-1 block text-xs text-slate-400">Leave blank for unlimited.</span>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Sort order</span>
          <input
            name="sortOrder"
            type="number"
            defaultValue={initial.sortOrder}
            title="Display order (lower shows first)"
            className={field}
          />
        </label>

        <label className="block sm:col-span-2">
          <span className="text-sm font-medium text-slate-700">Stripe Price ID</span>
          <input
            name="stripePriceId"
            defaultValue={initial.stripePriceId ?? ""}
            placeholder="price_..."
            title="Stripe recurring Price ID for checkout"
            className={field}
          />
          <span className="mt-1 block text-xs text-slate-400">
            The recurring Stripe Price this plan checks out with. Leave blank for free plans.
          </span>
        </label>
      </div>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Features (one per line)</span>
        <textarea
          name="features"
          rows={5}
          defaultValue={initial.features.join("\n")}
          placeholder={"Up to 10 event types\nCustom branding\nPriority support"}
          title="Feature bullets shown on the billing page"
          className={field}
        />
      </label>

      <div>
        <span className="text-sm font-medium text-slate-700">Features</span>
        <p className="mt-1 text-xs text-slate-400">
          Controls what accounts on this plan can actually do — each one has a matching
          server-side check, so unchecking a box takes effect immediately, not just on the
          pricing page.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {FEATURE_REGISTRY.map((f) => (
            <label key={f.key} className="flex items-start gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                name={`feature_${f.key}`}
                defaultChecked={initial.featureKeys.includes(f.key)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300"
              />
              <span>
                <span className="block font-medium">{f.label}</span>
                <span className="block text-xs text-slate-500">{f.description}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-6">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name="active"
            defaultChecked={initial.active}
            disabled={initial.isSystem}
            className="h-4 w-4 rounded border-slate-300"
          />
          Active (shown on billing page)
        </label>
      </div>

      {state && "error" in state && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}
      {state && "ok" in state && (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{state.message}</p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : mode === "create" ? "Create plan" : "Save plan"}
      </Button>
    </form>
  );
}
