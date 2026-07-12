"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { applyForPaymentsAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";

type Country = { code: string; name: string };

export default function ApplyForPaymentsForm({ countries }: { countries: Country[] }) {
  const [state, formAction] = useActionState(applyForPaymentsAction, null);

  useEffect(() => {
    if (state && "ok" in state && state.ok) toast.success(state.message);
    if (state && "error" in state) toast.error(state.error);
  }, [state]);

  return (
    <form action={formAction} className="mt-4 space-y-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Country of business</label>
        <NativeSelect name="country" required>
          <option value="">Select a country…</option>
          {countries.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </NativeSelect>
        <p className="mt-1 text-xs text-slate-500">
          India tenants are served by Razorpay; other countries by Stripe.
        </p>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">
          What kind of business is this?
        </label>
        <Textarea
          name="businessDescription"
          required
          rows={3}
          placeholder="e.g. 1:1 dermatology consultations, mostly returning patients."
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">
          Typical price range
        </label>
        <Input name="expectedPriceRange" required placeholder="e.g. $50-$150 per session" />
      </div>
      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          name="agree"
          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary focus:ring-ring"
        />
        <span>
          I agree that customer payments are held by the platform until 24 hours after each
          appointment, and that refunds and chargebacks may be issued at the platform&apos;s
          discretion during that window.
        </span>
      </label>
      <Button type="submit">Submit application</Button>
    </form>
  );
}
