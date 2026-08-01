"use client";

import { useActionState } from "react";
import { createPlanAction, updatePlanAction, type PlanFormState } from "./actions";
import { FEATURE_REGISTRY } from "@/lib/features";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

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
            <Input
              name="id"
              defaultValue={initial.id}
              placeholder="STARTER"
              title="Unique uppercase plan ID"
            />
          ) : (
            <>
              <input type="hidden" name="id" value={initial.id} />
              <Input
                value={initial.id}
                disabled
                title="Plan ID (immutable)" className="bg-slate-50 text-muted-foreground"
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
          <Input name="name" defaultValue={initial.name} placeholder="Starter" title="Plan display name" />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Price label</span>
          <Input
            name="priceLabel"
            defaultValue={initial.priceLabel}
            placeholder="$19/mo"
            title="Displayed price label"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Monthly price (USD)</span>
          <Input
            name="priceMonthly"
            type="number"
            min={0}
            defaultValue={initial.priceMonthly}
            disabled={initial.isSystem}
            title="Numeric monthly price for MRR math"
            className={initial.isSystem ? "bg-slate-50 text-muted-foreground" : ""}
          />
          {initial.isSystem && (
            <span className="mt-1 block text-xs text-slate-400">The FREE plan is always $0.</span>
          )}
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Max event types</span>
          <Input
            name="maxEventTypes"
            type="number"
            min={0}
            defaultValue={initial.maxEventTypes ?? ""}
            placeholder="Unlimited"
            title="Max active event types (blank = unlimited)"
          />
          <span className="mt-1 block text-xs text-slate-400">Leave blank for unlimited.</span>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Sort order</span>
          <Input
            name="sortOrder"
            type="number"
            defaultValue={initial.sortOrder}
            title="Display order (lower shows first)"
          />
        </label>

        <label className="block sm:col-span-2">
          <span className="text-sm font-medium text-slate-700">Stripe Price ID</span>
          <Input
            name="stripePriceId"
            defaultValue={initial.stripePriceId ?? ""}
            placeholder="price_..."
            title="Stripe recurring Price ID for checkout"
          />
          <span className="mt-1 block text-xs text-slate-400">
            The recurring Stripe Price this plan checks out with. Leave blank for free plans.
          </span>
        </label>
      </div>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Pricing-page bullets (one per line)</span>
        <Textarea
          name="features"
          rows={5}
          defaultValue={initial.features.join("\n")}
          placeholder={"Up to 10 event types\nCustom branding\nPriority support"}
          title="Marketing text shown on the billing page"
        />
        <p className="mt-1 text-xs text-amber-600">
          Display text only — purely cosmetic. It does NOT control what this plan
          unlocks and is not kept in sync with the feature gates below automatically.
          If you check/uncheck a gate below, update this list to match, or the pricing
          page will describe the plan incorrectly.
        </p>
      </label>

      <div>
        <span className="text-sm font-medium text-slate-700">Feature gates (what this plan actually unlocks)</span>
        <p className="mt-1 text-xs text-slate-400">
          Controls what accounts on this plan can actually do — each one has a matching
          server-side check, so unchecking a box takes effect immediately, not just on the
          pricing page. Remember to update the bullets above to match.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {FEATURE_REGISTRY.map((f) => (
            <label key={f.key} className="flex items-start gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                name={`feature_${f.key}`}
                defaultChecked={initial.featureKeys.includes(f.key)}
                className="mt-0.5 h-4 w-4 rounded border-input"
              />
              <span>
                <span className="block font-medium">{f.label}</span>
                <span className="block text-xs text-muted-foreground">{f.description}</span>
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
            className="h-4 w-4 rounded border-input"
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

      <SubmitButton disabled={pending}>
        {pending ? "Saving…" : mode === "create" ? "Create plan" : "Save plan"}
      </SubmitButton>
    </form>
  );
}
