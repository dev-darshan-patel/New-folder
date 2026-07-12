"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  approvePaymentApplicationAction,
  rejectPaymentApplicationAction,
  type AdminPaymentsState,
} from "./actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export default function PendingApplicationRow({
  id,
  businessName,
  email,
  country,
  businessDescription,
  expectedPriceRange,
  appliedAt,
}: {
  id: string;
  businessName: string;
  email: string;
  country: string;
  businessDescription: string;
  expectedPriceRange: string;
  appliedAt: string;
}) {
  const [approveState, approveAction] = useActionState<AdminPaymentsState, FormData>(
    approvePaymentApplicationAction,
    null,
  );
  const [rejectState, rejectAction] = useActionState<AdminPaymentsState, FormData>(
    rejectPaymentApplicationAction,
    null,
  );
  const [showRejectForm, setShowRejectForm] = useState(false);

  useEffect(() => {
    if (approveState && "ok" in approveState && approveState.ok) toast.success(approveState.message);
    if (approveState && "error" in approveState) toast.error(approveState.error);
  }, [approveState]);
  useEffect(() => {
    if (rejectState && "ok" in rejectState && rejectState.ok) toast.success(rejectState.message);
    if (rejectState && "error" in rejectState) toast.error(rejectState.error);
  }, [rejectState]);

  return (
    <div className="border-b border-slate-100 p-4 last:border-b-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="font-medium text-slate-900">{businessName}</p>
          <p className="text-xs text-slate-500">
            {email} · {country} · Applied {appliedAt}
          </p>
        </div>
      </div>
      <p className="mt-2 text-sm text-slate-700">{businessDescription}</p>
      <p className="mt-1 text-xs text-slate-500">Expected price range: {expectedPriceRange}</p>

      {!showRejectForm ? (
        <div className="mt-3 flex gap-2">
          <form action={approveAction}>
            <input type="hidden" name="id" value={id} />
            <Button type="submit" size="sm">
              Approve
            </Button>
          </form>
          <Button type="button" size="sm" variant="outline" onClick={() => setShowRejectForm(true)}>
            Reject
          </Button>
        </div>
      ) : (
        <form action={rejectAction} className="mt-3 space-y-2">
          <input type="hidden" name="id" value={id} />
          <Textarea
            name="reason"
            required
            rows={2}
            placeholder="Reason (shown to the tenant, e.g. 'Need clearer business description')"
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" variant="destructive">
              Confirm rejection
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setShowRejectForm(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
