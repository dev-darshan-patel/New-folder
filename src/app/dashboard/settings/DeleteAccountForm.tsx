"use client";

import { useActionState, useState } from "react";
import { requestAccountDeletionAction, type SettingsState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function DeleteAccountForm({
  hasPassword,
  slug,
  graceHours,
  impact,
}: {
  hasPassword: boolean;
  slug: string;
  graceHours: number;
  impact: { upcomingBookingCount: number; hasActiveSubscription: boolean };
}) {
  const [state, formAction, pending] = useActionState<SettingsState, FormData>(
    requestAccountDeletionAction,
    null,
  );
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Button
        type="button"
        variant="outline"
        className="border-red-300 text-red-600 hover:bg-red-50"
        onClick={() => setConfirming(true)}
      >
        Delete my account
      </Button>
    );
  }

  return (
    <form action={formAction} className="mt-4 space-y-4 rounded-xl border border-red-200 bg-red-50 p-4">
      <div className="text-sm text-red-800">
        <p className="font-medium">This will:</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          <li>
            Deactivate your account and public booking page after a {graceHours}-hour grace period
            (you can cancel any time before then)
          </li>
          {impact.upcomingBookingCount > 0 && (
            <li>
              Cancel {impact.upcomingBookingCount} upcoming booking
              {impact.upcomingBookingCount === 1 ? "" : "s"} and notify invitees
            </li>
          )}
          {impact.hasActiveSubscription && <li>Cancel your active subscription</li>}
          <li>Permanently delete all account data 30 days after that, unless you recover it</li>
        </ul>
      </div>

      {hasPassword ? (
        <div className="space-y-2">
          <Label htmlFor="password">Confirm your password</Label>
          <Input id="password" name="password" type="password" autoComplete="current-password" />
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="slugConfirm">
            Type <span className="font-mono">{slug}</span> to confirm
          </Label>
          <Input id="slugConfirm" name="slugConfirm" type="text" autoComplete="off" />
        </div>
      )}

      {state && "error" in state && (
        <p className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}
      {state && "ok" in state && (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{state.message}</p>
      )}

      <div className="flex gap-3">
        <Button
          type="submit"
          disabled={pending}
          variant="outline"
          className="border-red-300 text-red-600 hover:bg-red-100"
        >
          {pending ? "Scheduling…" : "Confirm deletion"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
