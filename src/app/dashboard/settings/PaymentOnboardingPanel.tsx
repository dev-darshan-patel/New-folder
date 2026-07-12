"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { refreshPaymentOnboardingAction } from "./actions";
import type { SettingsState } from "./actions";
import { Button } from "@/components/ui/button";

const PROVIDER_LABEL: Record<string, string> = {
  STRIPE: "Stripe",
  RAZORPAY: "Razorpay",
};

export default function PaymentOnboardingPanel({
  provider,
  accountId,
  ready,
}: {
  provider: string;
  accountId: string | null;
  ready: boolean;
}) {
  const [state, formAction] = useActionState<SettingsState, FormData>(
    refreshPaymentOnboardingAction,
    null,
  );

  useEffect(() => {
    if (state && "ok" in state && state.ok) toast.success(state.message);
    if (state && "error" in state) toast.error(state.error);
  }, [state]);

  const label = PROVIDER_LABEL[provider] ?? provider;
  const startUrl = `/api/payments/onboarding/${provider.toLowerCase()}/start`;

  if (ready) {
    return (
      <div className="mt-3 rounded-md border border-green-200 bg-white p-3">
        <p className="text-sm font-medium text-green-800">
          {label} account ready to accept payments.
        </p>
        <form action={formAction} className="mt-2 inline-block">
          <input type="hidden" name="provider" value={provider} />
          <Button type="submit" variant="outline" size="sm">
            Re-check status
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-md border border-amber-200 bg-white p-3">
      <p className="text-sm font-medium text-amber-800">
        {label} onboarding {accountId ? "in progress" : "not started"}.
      </p>
      <p className="mt-1 text-xs text-slate-600">
        {accountId
          ? "You started but haven't finished the KYC steps on the provider's site."
          : "You'll be redirected to the provider to complete KYC and add a bank account."}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button asChild size="sm">
          <a href={startUrl}>{accountId ? "Continue onboarding" : "Start onboarding"}</a>
        </Button>
        {accountId && (
          <form action={formAction}>
            <input type="hidden" name="provider" value={provider} />
            <Button type="submit" variant="outline" size="sm">
              Refresh status
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
