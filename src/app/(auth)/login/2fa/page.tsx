import { redirect } from "next/navigation";
import Link from "next/link";
import { readPending2fa } from "@/lib/auth";
import TwoFactorForm from "./TwoFactorForm";

export default async function TwoFactorChallengePage() {
  const pending = await readPending2fa();
  if (!pending) redirect("/login");

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">
        Two-factor authentication
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        Open your authenticator app and enter the 6-digit code, or paste a backup code.
      </p>
      <TwoFactorForm />
      <p className="mt-6 text-sm text-slate-600">
        <Link href="/login" className="font-medium text-indigo-600 hover:underline">
          Sign in as a different user
        </Link>
      </p>
    </div>
  );
}
