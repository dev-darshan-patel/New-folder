"use client";

import { useActionState, useEffect } from "react";
import { signupAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SignupForm() {
  const [state, formAction, pending] = useActionState(signupAction, null);

  useEffect(() => {
    const el = document.getElementById("signup-tz") as HTMLInputElement | null;
    if (el) el.value = Intl.DateTimeFormat().resolvedOptions().timeZone;
  }, []);

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <input type="hidden" name="timezone" id="signup-tz" defaultValue="UTC" />

      <Field label="Your name" name="name" type="text" autoComplete="name" />
      <Field label="Business name" name="businessName" type="text" />
      <Field label="Email" name="email" type="email" autoComplete="email" />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        hint="At least 8 characters"
      />

      {state?.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}

      <Button
        type="submit"
        disabled={pending}
        className="w-full"
      >
        {pending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}

function Field({
  label,
  hint,
  ...props
}: {
  label: string;
  hint?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-2">
      <Label htmlFor={props.name}>{label}</Label>
      <Input
        id={props.name}
        {...props}
        required
      />
      {hint && <span className="text-xs text-slate-400">{hint}</span>}
    </div>
  );
}
