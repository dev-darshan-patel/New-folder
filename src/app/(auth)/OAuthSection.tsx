import { isFeatureEnabled } from "@/lib/feature-flags";
import OAuthButtons from "./OAuthButtons";

export default async function OAuthSection() {
  const enabled = await isFeatureEnabled("oauth_login");
  if (!enabled) return null;

  return (
    <>
      <div className="mt-8">
        <OAuthButtons />
      </div>
      <div className="mt-6 flex items-center gap-3 text-xs text-slate-400">
        <div className="h-px flex-1 bg-slate-200" />
        or with email
        <div className="h-px flex-1 bg-slate-200" />
      </div>
    </>
  );
}
