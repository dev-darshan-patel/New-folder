"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { cancelDeletionRequestAction } from "@/app/dashboard/settings/actions";
import { Button } from "@/components/ui/button";

export default function KeepAccountButton() {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      size="sm"
      disabled={pending}
      className="bg-red-950 text-red-50 hover:bg-red-900"
      onClick={() => {
        startTransition(async () => {
          await cancelDeletionRequestAction();
          toast.success("Account deletion cancelled — your account stays active.");
        });
      }}
    >
      {pending ? "Cancelling…" : "Keep my account"}
    </Button>
  );
}
