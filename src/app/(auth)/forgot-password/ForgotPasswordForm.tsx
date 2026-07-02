"use client";

import { useActionState } from "react";
import { requestPasswordResetAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordResetAction, null);

  if (state && "ok" in state && state.ok) {
    return (
      <p className="mt-8 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
        If an account exists for that email, a reset link is on its way. Check your inbox.
      </p>
    );
  }

  return (
    <form action={formAction} className="mt-8 space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
      </div>

      {state && "error" in state && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}

      <Button
        type="submit"
        disabled={pending}
        className="w-full"
      >
        {pending ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}
