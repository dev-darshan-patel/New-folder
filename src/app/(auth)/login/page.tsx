import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isFeatureEnabled } from "@/lib/feature-flags";
import OAuthSection from "../OAuthSection";
import LoginForm from "./LoginForm";

export default async function LoginPage() {
  // Already signed in — send them straight to their dashboard/admin console
  // instead of showing the form again (same destination loginAction uses).
  const existingUser = await getCurrentUser();
  if (existingUser) redirect(existingUser.adminRole ? "/admin" : "/dashboard");

  const oauthEnabled = await isFeatureEnabled("oauth_login");

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Welcome back</h1>
      <p className="mt-2 text-sm text-slate-600">Log in to your dashboard.</p>

      <OAuthSection />
      <LoginForm showEmailDivider={oauthEnabled} />
    </div>
  );
}
