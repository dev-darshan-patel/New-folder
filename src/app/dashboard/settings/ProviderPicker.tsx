"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { setActivePaymentProviderAction } from "./actions";
import type { SettingsState } from "./actions";
import { Button } from "@/components/ui/button";

const PROVIDER_LABEL: Record<string, string> = {
  STRIPE: "Stripe",
  RAZORPAY: "Razorpay",
};

export default function ProviderPicker({
  eligible,
  active,
}: {
  eligible: string[];
  active: string | null;
}) {
  const [state, formAction] = useActionState<SettingsState, FormData>(
    setActivePaymentProviderAction,
    null,
  );

  useEffect(() => {
    if (state && "ok" in state && state.ok) toast.success(state.message);
    if (state && "error" in state) toast.error(state.error);
  }, [state]);

  // Only one eligible provider: no choice to make, just show what it'll be.
  if (eligible.length <= 1) {
    return (
      <p className="mt-3 text-sm text-slate-600">
        You&apos;ll use <span className="font-medium">{PROVIDER_LABEL[eligible[0]] ?? eligible[0]}</span> to collect payments. Onboarding
        instructions will appear here shortly.
      </p>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      <p className="text-sm font-medium text-slate-700">Choose your payment provider</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {eligible.map((p) => (
          <form key={p} action={formAction}>
            <input type="hidden" name="provider" value={p} />
            <Button
              type="submit"
              variant={active === p ? "default" : "outline"}
              className="w-full"
            >
              {PROVIDER_LABEL[p] ?? p}
              {active === p && " ✓"}
            </Button>
          </form>
        ))}
      </div>
      <p className="text-xs text-slate-500">
        You can switch providers whenever you have no in-flight payments.
      </p>
    </div>
  );
}
