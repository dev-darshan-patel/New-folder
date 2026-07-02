"use client";

import { useState, useTransition } from "react";

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
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="recipient@example.com"
          className="w-64 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
        />
        <button
          type="button"
          onClick={handleClick}
          disabled={isPending || !email.includes("@")}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {isPending ? "Sending…" : "Send test email"}
        </button>
      </div>
      {result && (
        <p className={`text-sm font-medium ${result.ok ? "text-green-700" : "text-red-600"}`}>
          {result.ok ? `Sent to ${email} — check the inbox.` : `Failed: ${result.error}`}
        </p>
      )}
    </div>
  );
}
