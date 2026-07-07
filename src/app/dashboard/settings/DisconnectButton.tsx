"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export default function DisconnectButton({
  action,
  provider,
}: {
  action: () => Promise<void>;
  provider: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          await action();
          toast.success(`${provider} disconnected.`);
        });
      }}
    >
      {pending ? "Disconnecting…" : "Disconnect"}
    </Button>
  );
}
