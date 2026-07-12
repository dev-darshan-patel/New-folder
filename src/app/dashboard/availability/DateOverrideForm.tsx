"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

export default function DateOverrideForm({
  action,
}: {
  action: (formData: FormData) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [type, setType] = useState<"BLOCKED" | "CUSTOM_HOURS">("BLOCKED");
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={(formData) => {
        startTransition(async () => {
          const result = await action(formData);
          if (result.ok) {
            toast.success("Date override saved.");
          } else {
            toast.error(result.error ?? "Couldn't save that override.");
          }
        });
      }}
      className="flex flex-wrap items-end gap-3"
    >
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Date</label>
        <Input type="date" name="date" required className="w-auto" />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Type</label>
        <NativeSelect
          name="type"
          value={type}
          onChange={(e) => setType(e.target.value as "BLOCKED" | "CUSTOM_HOURS")}
          className="w-auto"
        >
          <option value="BLOCKED">Closed all day</option>
          <option value="CUSTOM_HOURS">Custom hours</option>
        </NativeSelect>
      </div>
      {type === "CUSTOM_HOURS" && (
        <>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Start</label>
            <Input type="time" name="startTime" defaultValue="09:00" className="w-auto" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">End</label>
            <Input type="time" name="endTime" defaultValue="17:00" className="w-auto" />
          </div>
        </>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Add override"}
      </Button>
    </form>
  );
}
