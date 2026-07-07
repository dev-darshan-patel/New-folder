"use client";

import { useActionState } from "react";
import { resetPasswordAction, type ResetState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function ResetPasswordForm({ token }: { token: string }) {
  const action = resetPasswordAction.bind(null, token);
  const [state, formAction, pending] = useActionState<ResetState, FormData>(action, null);

  return (
    <form action={formAction} className="mt-8 space-y-4">
      <label className="block">
        <span className="text-sm font-medium text-slate-700">New password</span>
        <Input
          name="password"
          type="password"
          autoComplete="new-password"
          required
          className="mt-1"
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-slate-700">Confirm password</span>
        <Input
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          className="mt-1"
        />
      </label>
      {state?.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Saving…" : "Set new password"}
      </Button>
    </form>
  );
}
