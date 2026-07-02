import Link from "next/link";
import ForgotPasswordForm from "./ForgotPasswordForm";

export default function ForgotPasswordPage() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Reset your password</h1>
      <p className="mt-2 text-sm text-slate-600">
        Enter your account email and we&apos;ll send you a link to set a new password.
      </p>
      <ForgotPasswordForm />
      <p className="mt-6 text-sm text-slate-600">
        Remembered it?{" "}
        <Link href="/login" className="font-medium text-indigo-600 hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
