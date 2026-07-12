"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import {
  updateRazorpaySettingsAction,
  clearRazorpaySecretAction,
  type AdminPaymentsState,
} from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

function maskTail(value: string | null): string {
  if (!value) return "Not set";
  return `Set — ends in ${value.slice(-4)}`;
}

function SecretRow({
  label,
  name,
  currentValue,
  clearField,
}: {
  label: string;
  name: string;
  currentValue: string | null;
  clearField: string;
}) {
  const [state, formAction] = useActionState<AdminPaymentsState, FormData>(
    clearRazorpaySecretAction,
    null,
  );
  useEffect(() => {
    if (state && "ok" in state && state.ok) toast.success(state.message);
    if (state && "error" in state) toast.error(state.error);
  }, [state]);

  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-600">{label}</label>
      <p className="mb-1 text-xs text-slate-500">{maskTail(currentValue)}</p>
      <Input type="password" name={name} placeholder="Leave blank to keep existing" />
      {currentValue && (
        <form action={formAction} className="mt-1 inline-block">
          <input type="hidden" name="field" value={clearField} />
          <Button type="submit" variant="link" size="sm" className="h-auto p-0 text-xs text-red-600">
            Clear
          </Button>
        </form>
      )}
    </div>
  );
}

export default function RazorpaySettingsForm({
  mode,
  testKeyId,
  testKeySecret,
  testWebhookSecret,
  liveKeyId,
  liveKeySecret,
  liveWebhookSecret,
}: {
  mode: string;
  testKeyId: string | null;
  testKeySecret: string | null;
  testWebhookSecret: string | null;
  liveKeyId: string | null;
  liveKeySecret: string | null;
  liveWebhookSecret: string | null;
}) {
  const [state, formAction] = useActionState<AdminPaymentsState, FormData>(
    updateRazorpaySettingsAction,
    null,
  );

  useEffect(() => {
    if (state && "ok" in state && state.ok) toast.success(state.message);
    if (state && "error" in state) toast.error(state.error);
  }, [state]);

  return (
    <form action={formAction} className="space-y-6">
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Razorpay mode</label>
        <NativeSelect name="razorpayMode" defaultValue={mode}>
          <option value="TEST">Test</option>
          <option value="LIVE">Live</option>
        </NativeSelect>
        <p className="mt-1 text-xs text-slate-500">
          Test and live credentials never mix — whichever mode is active, only that mode&apos;s
          keys are used.
        </p>
      </div>

      <fieldset className="space-y-3 rounded-md border border-slate-200 p-4">
        <legend className="px-1 text-xs font-medium text-slate-600">Test credentials</legend>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Key ID</label>
          <Input name="razorpayTestKeyId" defaultValue={testKeyId ?? ""} placeholder="rzp_test_..." />
        </div>
        <SecretRow
          label="Key secret"
          name="razorpayTestKeySecret"
          currentValue={testKeySecret}
          clearField="razorpayTestKeySecret"
        />
        <SecretRow
          label="Webhook secret"
          name="razorpayTestWebhookSecret"
          currentValue={testWebhookSecret}
          clearField="razorpayTestWebhookSecret"
        />
      </fieldset>

      <fieldset className="space-y-3 rounded-md border border-slate-200 p-4">
        <legend className="px-1 text-xs font-medium text-slate-600">Live credentials</legend>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Key ID</label>
          <Input name="razorpayLiveKeyId" defaultValue={liveKeyId ?? ""} placeholder="rzp_live_..." />
        </div>
        <SecretRow
          label="Key secret"
          name="razorpayLiveKeySecret"
          currentValue={liveKeySecret}
          clearField="razorpayLiveKeySecret"
        />
        <SecretRow
          label="Webhook secret"
          name="razorpayLiveWebhookSecret"
          currentValue={liveWebhookSecret}
          clearField="razorpayLiveWebhookSecret"
        />
      </fieldset>

      <Button type="submit">Save Razorpay credentials</Button>
    </form>
  );
}
