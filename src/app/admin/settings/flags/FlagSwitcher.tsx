"use client";

import { useTransition, useOptimistic } from "react";
import { Switch } from "@/components/ui/switch";
import { toggleFeatureFlagAction } from "./actions";

export function FlagSwitcher({ flagKey, enabled }: { flagKey: string, enabled: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [optimisticEnabled, addOptimistic] = useOptimistic(
    enabled,
    (_, newEnabled: boolean) => newEnabled
  );

  return (
    <div className="flex items-center gap-3">
      <span className={`text-sm font-medium ${optimisticEnabled ? "text-slate-900" : "text-slate-500"}`}>
        {optimisticEnabled ? "Enabled" : "Disabled"}
      </span>
      <Switch 
        checked={optimisticEnabled} 
        disabled={isPending}
        onCheckedChange={(checked) => {
          startTransition(async () => {
            addOptimistic(checked);
            const formData = new FormData();
            formData.append("key", flagKey);
            formData.append("enabled", checked ? "true" : "false");
            await toggleFeatureFlagAction(formData);
          });
        }} 
      />
    </div>
  );
}
