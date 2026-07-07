"use client";

import { useActionState } from "react";
import { verifyTwoFactorAction } from "../../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function TwoFactorForm() {
  const [state, formAction, pending] = useActionState(verifyTwoFactorAction, null);

  return (
    <form action={formAction} className="mt-8 space-y-4">
      <label className="block">
        <span className="text-sm font-medium text-slate-700">Authentication code</span>
        <Input
          name="code"
          inputMode="text"
          autoComplete="one-time-code"
          autoFocus
          required
          placeholder="123456"
          className="mt-1"
        />
      </label>

      {state?.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Verifying…" : "Verify"}
      </Button>
    </form>
  );
}
