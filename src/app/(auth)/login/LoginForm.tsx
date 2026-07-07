"use client";

import { Suspense, useActionState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { loginAction } from "../actions";
import { oauthErrorMessage } from "../oauth-errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function OAuthError() {
  const searchParams = useSearchParams();
  const message = oauthErrorMessage(searchParams.get("error"));
  const recovered = searchParams.get("recovered") === "1";
  return (
    <>
      {message && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>
      )}
      {recovered && (
        <p className="mt-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
          Your account has been restored. Log in below.
        </p>
      )}
    </>
  );
}

export default function LoginForm({ showEmailDivider }: { showEmailDivider: boolean }) {
  const [state, formAction, pending] = useActionState(loginAction, null);

  return (
    <>
      <Suspense fallback={null}>
        <OAuthError />
      </Suspense>

      {showEmailDivider && (
        <div className="mt-6 flex items-center gap-3 text-xs text-slate-400">
          <div className="h-px flex-1 bg-slate-200" />
          or with email
          <div className="h-px flex-1 bg-slate-200" />
        </div>
      )}

      <form action={formAction} className={showEmailDivider ? "mt-6 space-y-4" : "mt-8 space-y-4"}>
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
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>

        <div className="flex justify-end">
          <Link href="/forgot-password" className="text-sm font-medium text-indigo-600 hover:underline">
            Forgot password?
          </Link>
        </div>

        {state?.error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
        )}

        <Button
          type="submit"
          disabled={pending}
          className="w-full"
        >
          {pending ? "Logging in…" : "Log in"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-600">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="font-medium text-indigo-600 hover:underline">
          Sign up
        </Link>
      </p>
    </>
  );
}
