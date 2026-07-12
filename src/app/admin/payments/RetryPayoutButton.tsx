"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { retryPayoutAction, type AdminPaymentsState } from "./actions";
import { Button } from "@/components/ui/button";

export default function RetryPayoutButton({ bookingId }: { bookingId: string }) {
  const [state, formAction] = useActionState<AdminPaymentsState, FormData>(
    retryPayoutAction,
    null,
  );

  useEffect(() => {
    if (state && "ok" in state && state.ok) toast.success(state.message);
    if (state && "error" in state) toast.error(state.error);
  }, [state]);

  return (
    <form action={formAction} className="inline-block">
      <input type="hidden" name="bookingId" value={bookingId} />
      <Button type="submit" size="sm" variant="outline">
        Retry
      </Button>
    </form>
  );
}
