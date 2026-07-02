import { getCurrentUser } from "@/lib/auth";
import { getFeatureFlags } from "@/lib/feature-flags";
import { FlagSwitcher } from "./FlagSwitcher";
import { Card, CardContent } from "@/components/ui/card";

export default async function AdminFeatureFlagsPage() {
  const viewer = await getCurrentUser();
  if (!viewer || viewer.adminRole !== "SUPER_ADMIN") {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Feature flags</h1>
        <p className="mt-2 text-sm text-slate-500">
          Platform settings are restricted to Super Admins.
        </p>
      </div>
    );
  }

  const flags = await getFeatureFlags();

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Feature flags</h1>
      <p className="mt-1 text-sm text-slate-600">
        Toggle product capabilities platform-wide. Disabled flags hide UI and block server-side
        paths that check them.
      </p>

      <div className="mt-6 space-y-3">
        {flags.map((flag) => (
          <Card key={flag.key}>
            <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-900">{flag.label}</p>
                <p className="mt-0.5 text-xs font-mono text-slate-400">{flag.key}</p>
                {flag.description && (
                  <p className="mt-2 text-sm text-slate-600">{flag.description}</p>
                )}
              </div>
              <FlagSwitcher flagKey={flag.key} enabled={flag.enabled} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
