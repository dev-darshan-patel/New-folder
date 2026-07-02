"use client";

import { useActionState } from "react";
import { disableTotpAction, type SecurityState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function DisableTotpForm() {
  const [state, formAction, pending] = useActionState<SecurityState, FormData>(
    disableTotpAction,
    null,
  );

  return (
    <form action={formAction} className="mt-5 space-y-4">
      <div className="space-y-2">
        <Label htmlFor="password" className="text-green-900">
          Confirm your password to turn 2FA off
        </Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>

      {state && "error" in state && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}
      {state && "ok" in state && (
        <p className="rounded-lg bg-white/70 px-3 py-2 text-sm text-green-800">{state.message}</p>
      )}

      <Button
        type="submit"
        variant="destructive"
        disabled={pending}
      >
        {pending ? "Disabling…" : "Disable 2FA"}
      </Button>
    </form>
  );
}
