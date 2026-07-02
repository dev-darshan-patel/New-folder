"use client";

import { useActionState, useState } from "react";
import { verifyEnableTotpAction, type SecurityState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  secret: string;
  qrDataUrl: string;
  otpauth: string;
};

export default function EnableTotpForm({ secret, qrDataUrl }: Props) {
  const [state, formAction, pending] = useActionState<SecurityState, FormData>(
    verifyEnableTotpAction,
    null,
  );
  const [copied, setCopied] = useState(false);

  const successCodes = state && "ok" in state ? state.backupCodes : undefined;

  if (successCodes && successCodes.length > 0) {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
        <p className="font-semibold text-amber-900">Save your backup codes now</p>
        <p className="mt-1 text-sm text-amber-800">
          Store these somewhere safe. Each code works once if you lose your authenticator.
          They will not be shown again.
        </p>
        <ul className="mt-4 grid grid-cols-2 gap-2 rounded-lg bg-white p-3 font-mono text-sm text-slate-800">
          {successCodes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <Button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(successCodes.join("\n"));
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className="mt-4"
        >
          {copied ? "Copied!" : "Copy codes"}
        </Button>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <p className="font-semibold text-slate-900">Scan this QR code</p>
      <p className="mt-1 text-sm text-slate-600">
        Use Google Authenticator, Authy, 1Password, or any other TOTP app.
      </p>

      <div className="mt-4 flex flex-col items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qrDataUrl}
          alt="TOTP QR code"
          className="rounded-lg border border-slate-200"
          width={180}
          height={180}
        />
        <div>
          <p className="text-xs text-slate-500">
            Or enter this secret manually:
          </p>
          <code className="mt-1 block break-all rounded bg-slate-100 px-2 py-1 font-mono text-xs text-slate-700">
            {secret}
          </code>
        </div>
      </div>

      <form action={formAction} className="mt-5 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="code">Enter the 6-digit code from your app</Label>
          <Input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            placeholder="123456"
          />
        </div>

        {state && "error" in state && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
        )}

        <Button
          type="submit"
          disabled={pending}
        >
          {pending ? "Verifying…" : "Enable 2FA"}
        </Button>
      </form>
    </section>
  );
}
