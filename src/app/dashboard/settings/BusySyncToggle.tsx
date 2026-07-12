"use client";

import { useTransition } from "react";
import { toast } from "sonner";

export default function BusySyncToggle({
  action,
  initialEnabled,
}: {
  action: (enabled: boolean) => Promise<void>;
  initialEnabled: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
      <input
        type="checkbox"
        defaultChecked={initialEnabled}
        disabled={pending}
        className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-ring"
        onChange={(e) => {
          const enabled = e.target.checked;
          startTransition(async () => {
            await action(enabled);
            toast.success(enabled ? "Busy-time sync enabled." : "Busy-time sync disabled.");
          });
        }}
      />
      Block times I&apos;m busy on Google Calendar
    </label>
  );
}
