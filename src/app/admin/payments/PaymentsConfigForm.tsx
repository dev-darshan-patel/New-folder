"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { updatePaymentsPlatformConfigAction, type AdminPaymentsState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function PaymentsConfigForm({
  stripeForIndiaEnabled,
  paymentFeePercent,
}: {
  stripeForIndiaEnabled: boolean;
  paymentFeePercent: number;
}) {
  const [state, formAction] = useActionState<AdminPaymentsState, FormData>(
    updatePaymentsPlatformConfigAction,
    null,
  );

  useEffect(() => {
    if (state && "ok" in state && state.ok) toast.success(state.message);
    if (state && "error" in state) toast.error(state.error);
  }, [state]);

  return (
    <form action={formAction} className="space-y-4">
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          name="stripeForIndiaEnabled"
          defaultChecked={stripeForIndiaEnabled}
          className="mt-1 h-4 w-4 rounded border-slate-300 text-primary focus:ring-ring"
        />
        <span>
          <span className="block text-sm font-medium text-slate-700">
            Offer Stripe to Indian tenants
          </span>
          <span className="block text-xs text-slate-500">
            Default OFF. Only enable after verifying Stripe onboarding actually works with a
            real Indian account — Stripe&apos;s India marketplace onboarding is restricted.
          </span>
        </span>
      </label>

      <div>
        <label className="block text-sm font-medium text-slate-700">
          Platform fee (%)
        </label>
        <div className="mt-1 flex max-w-xs items-center gap-2">
          <Input
            type="number"
            name="paymentFeePercent"
            defaultValue={paymentFeePercent}
            step="0.1"
            min="0"
            max="30"
            required
          />
          <span className="text-sm text-slate-500">%</span>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Deducted from each payout at release time. Between 0 and 30.
        </p>
      </div>

      <Button type="submit">Save payments config</Button>
    </form>
  );
}
