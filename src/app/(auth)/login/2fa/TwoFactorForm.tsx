"use client";

import { useActionState } from "react";
import { verifyTwoFactorAction } from "../../actions";

export default function TwoFactorForm() {
  const [state, formAction, pending] = useActionState(verifyTwoFactorAction, null);

  return (
    <form action={formAction} className="mt-8 space-y-4">
      <label className="block">
        <span className="text-sm font-medium text-slate-700">Authentication code</span>
        <input
          name="code"
          inputMode="text"
          autoComplete="one-time-code"
          autoFocus
          required
          placeholder="123456"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
        />
      </label>

      {state?.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:opacity-60"
      >
        {pending ? "Verifying…" : "Verify"}
      </button>
    </form>
  );
}
