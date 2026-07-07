"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function TestEmailButton({
  action,
}: {
  action: (email: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<{ ok: boolean; error?: string } | null>(null);

  function handleClick() {
    setResult(null);
    startTransition(async () => {
      const res = await action(email);
      setResult(res);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="recipient@example.com"
          className="w-64"
        />
        <Button
          type="button"
          variant="outline"
          onClick={handleClick}
          disabled={isPending || !email.includes("@")}
        >
          {isPending ? "Sending…" : "Send test email"}
        </Button>
      </div>
      {result && (
        <p className={`text-sm font-medium ${result.ok ? "text-green-700" : "text-red-600"}`}>
          {result.ok ? `Sent to ${email} — check the inbox.` : `Failed: ${result.error}`}
        </p>
      )}
    </div>
  );
}
