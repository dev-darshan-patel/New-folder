"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export default function DeleteOverrideButton({
  id,
  action,
}: {
  id: string;
  action: (id: string) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          await action(id);
          toast.success("Override removed.");
        });
      }}
    >
      {pending ? "Removing…" : "Remove"}
    </Button>
  );
}
