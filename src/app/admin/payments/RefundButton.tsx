"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { manualRefundAction, type AdminPaymentsState } from "./actions";
import { Button } from "@/components/ui/button";

export default function RefundButton({ bookingId }: { bookingId: string }) {
  const [state, formAction] = useActionState<AdminPaymentsState, FormData>(
    manualRefundAction,
    null,
  );
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (state && "ok" in state && state.ok) toast.success(state.message);
    if (state && "error" in state) toast.error(state.error);
  }, [state]);

  if (!confirming) {
    return (
      <Button type="button" size="sm" variant="outline" onClick={() => setConfirming(true)}>
        Refund
      </Button>
    );
  }

  return (
    <form action={formAction} className="inline-flex items-center gap-2">
      <input type="hidden" name="bookingId" value={bookingId} />
      <Button type="submit" size="sm" variant="destructive">
        Confirm refund
      </Button>
      <Button type="button" size="sm" variant="outline" onClick={() => setConfirming(false)}>
        Cancel
      </Button>
    </form>
  );
}
