"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { suspendPaymentsAction, unsuspendPaymentsAction, type AdminPaymentsState } from "./actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export default function SuspendTenantRow({
  userId,
  businessName,
  email,
  status,
  country,
}: {
  userId: string;
  businessName: string;
  email: string;
  status: "APPROVED" | "SUSPENDED";
  country: string;
}) {
  const [suspendState, suspendAction] = useActionState<AdminPaymentsState, FormData>(
    suspendPaymentsAction,
    null,
  );
  const [unsuspendState, unsuspendAction] = useActionState<AdminPaymentsState, FormData>(
    unsuspendPaymentsAction,
    null,
  );
  const [showSuspendForm, setShowSuspendForm] = useState(false);

  useEffect(() => {
    if (suspendState && "ok" in suspendState && suspendState.ok) toast.success(suspendState.message);
    if (suspendState && "error" in suspendState) toast.error(suspendState.error);
  }, [suspendState]);
  useEffect(() => {
    if (unsuspendState && "ok" in unsuspendState && unsuspendState.ok)
      toast.success(unsuspendState.message);
    if (unsuspendState && "error" in unsuspendState) toast.error(unsuspendState.error);
  }, [unsuspendState]);

  return (
    <div className="border-b border-slate-100 p-4 last:border-b-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="font-medium text-slate-900">{businessName}</p>
          <p className="text-xs text-slate-500">
            {email} · {country}
          </p>
        </div>
        <span
          className={
            status === "APPROVED"
              ? "rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700"
              : "rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700"
          }
        >
          {status}
        </span>
      </div>

      {status === "APPROVED" &&
        (!showSuspendForm ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-2"
            onClick={() => setShowSuspendForm(true)}
          >
            Suspend
          </Button>
        ) : (
          <form action={suspendAction} className="mt-3 space-y-2">
            <input type="hidden" name="userId" value={userId} />
            <Textarea name="reason" required rows={2} placeholder="Reason (audit log)" />
            <div className="flex gap-2">
              <Button type="submit" size="sm" variant="destructive">
                Confirm suspension
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setShowSuspendForm(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        ))}

      {status === "SUSPENDED" && (
        <form action={unsuspendAction} className="mt-2">
          <input type="hidden" name="userId" value={userId} />
          <Button type="submit" size="sm">
            Re-enable payments
          </Button>
        </form>
      )}
    </div>
  );
}
