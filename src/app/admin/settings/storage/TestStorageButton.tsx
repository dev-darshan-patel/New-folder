"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

export default function TestStorageButton({
  action,
}: {
  action: () => Promise<{ ok: boolean; error?: string }>;
}) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; error?: string } | null>(null);

  function handleClick() {
    setResult(null);
    startTransition(async () => {
      const res = await action();
      setResult(res);
    });
  }

  return (
    <div className="space-y-2">
      <Button type="button" variant="outline" onClick={handleClick} disabled={isPending}>
        {isPending ? "Testing…" : "Test connection"}
      </Button>
      {result && (
        <p className={`text-sm font-medium ${result.ok ? "text-green-700" : "text-red-600"}`}>
          {result.ok
            ? "Success — uploaded and deleted a test file."
            : `Failed: ${result.error}`}
        </p>
      )}
    </div>
  );
}
