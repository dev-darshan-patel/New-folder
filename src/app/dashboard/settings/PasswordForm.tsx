"use client";

import { useActionState } from "react";
import { changePasswordAction, type SettingsState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const [state, formAction, pending] = useActionState<SettingsState, FormData>(
    changePasswordAction,
    null,
  );

  return (
    <form action={formAction} className="mt-5 space-y-5">
      {!hasPassword && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          This account signs in with Google or Microsoft and has no password to change.
        </p>
      )}

      <div className="space-y-2">
        <Label htmlFor="currentPassword">Current password</Label>
        <Input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="newPassword">New password</Label>
        <Input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
        />
        <span className="text-xs text-slate-400">At least 8 characters</span>
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Confirm new password</Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
        />
      </div>

      {state && "error" in state && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}
      {state && "ok" in state && (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
          {state.message}
        </p>
      )}

      <Button
        type="submit"
        disabled={pending || !hasPassword}
      >
        {pending ? "Changing…" : "Change password"}
      </Button>
    </form>
  );
}
