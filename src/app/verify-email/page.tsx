import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { logoutAction } from "@/app/(auth)/actions";
import ResendButton from "./ResendButton";

// "Check your inbox" pending page. This is the hard gate: unverified accounts
// land here (redirected from the dashboard layout) and can't reach any feature
// until they click the verification link we emailed them.
export default async function VerifyEmailPendingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // Already verified (incl. all OAuth accounts) — nothing to do here.
  if (user.emailVerifiedAt) redirect("/dashboard");

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 text-2xl">
        ✉️
      </div>
      <h1 className="mt-5 text-center text-2xl font-bold tracking-tight text-slate-900">
        Verify your email
      </h1>
      <p className="mt-3 text-center text-sm text-slate-600">
        We sent a verification link to{" "}
        <strong className="text-slate-900">{user.email}</strong>. Click it to
        activate your account — you&apos;ll get access to your dashboard right
        after.
      </p>
      <p className="mt-4 text-center text-xs text-slate-500">
        Didn&apos;t get it? Check your spam folder, or resend below.
      </p>

      <div className="mt-2 flex justify-center">
        <ResendButton />
      </div>

      <div className="mt-8 border-t border-slate-100 pt-4 text-center">
        <form action={logoutAction}>
          <button
            type="submit"
            className="text-xs font-medium text-slate-500 hover:text-slate-800 hover:underline"
          >
            Use a different account
          </button>
        </form>
      </div>
    </div>
  );
}
