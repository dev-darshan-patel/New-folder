import Link from "next/link";
import { getPlatformConfig } from "@/lib/platform-config";
import OAuthSection from "../OAuthSection";
import SignupForm from "./SignupForm";

export default async function SignupPage() {
  const { signupsEnabled, supportEmail } = await getPlatformConfig();

  if (!signupsEnabled) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Signups paused</h1>
        <p className="mt-3 text-sm text-slate-600">
          New account registration is temporarily disabled.
        </p>
        {supportEmail && (
          <p className="mt-4 text-sm text-slate-500">
            Contact{" "}
            <a href={`mailto:${supportEmail}`} className="font-medium text-indigo-600 hover:underline">
              {supportEmail}
            </a>
          </p>
        )}
        <p className="mt-6 text-sm text-slate-600">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-indigo-600 hover:underline">
            Log in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Create your account</h1>
      <p className="mt-2 text-sm text-slate-600">Start taking bookings in minutes.</p>

      <OAuthSection />
      <SignupForm />

      <p className="mt-6 text-center text-sm text-slate-600">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-indigo-600 hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
