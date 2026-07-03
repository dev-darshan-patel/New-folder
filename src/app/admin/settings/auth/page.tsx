import { headers } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { getPlatformSettings } from "@/lib/settings";
import { isProviderConfigured } from "@/lib/oauth";
import { updateAuthSettingsAction, clearAuthSecretAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const SECRET_FIELD_NAMES = ["googleClientSecret", "microsoftClientSecret"] as const;

function maskTail(value: string | null): string {
  if (!value) return "Not set";
  return `Set — ends in ${value.slice(-4)}`;
}

export default async function AdminAuthSettingsPage() {
  const viewer = await getCurrentUser();
  if (!viewer || viewer.adminRole !== "SUPER_ADMIN") {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Sign-in providers</h1>
        <p className="mt-2 text-sm text-slate-500">
          Platform settings are restricted to Super Admins.
        </p>
      </div>
    );
  }

  const settings = await getPlatformSettings();
  const [googleReady, microsoftReady] = await Promise.all([
    isProviderConfigured("google"),
    isProviderConfigured("microsoft"),
  ]);

  const hdrs = await headers();
  const host = hdrs.get("host") ?? "localhost:3000";
  const proto = host.startsWith("localhost") ? "http" : "https";
  const baseUrl = `${proto}://${host}`;
  const callbackUrl = (provider: string) => `${baseUrl}/api/auth/${provider}/callback`;

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Sign-in providers</h1>
      <p className="mt-1 text-sm text-slate-600">
        Let businesses sign up and log in with Google or Microsoft instead of (or in addition
        to) a password.
      </p>

      <form action={updateAuthSettingsAction} className="mt-6 space-y-8">
        <ProviderPanel
          title="Google"
          ready={googleReady}
          redirectUriValue={callbackUrl("google")}
          setupHref="https://console.cloud.google.com/apis/credentials"
          fields={
            <>
              <PlainField
                label="Client ID"
                name="googleClientId"
                defaultValue={settings.googleClientId ?? ""}
                placeholder="xxxxxxxx.apps.googleusercontent.com"
              />
              <SecretField
                label="Client secret"
                name="googleClientSecret"
                masked={maskTail(settings.googleClientSecret)}
                placeholder="GOCSPX-..."
              />
            </>
          }
        />

        <ProviderPanel
          title="Microsoft (Outlook)"
          ready={microsoftReady}
          redirectUriValue={callbackUrl("microsoft")}
          setupHref="https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade"
          fields={
            <>
              <PlainField
                label="Application (client) ID"
                name="microsoftClientId"
                defaultValue={settings.microsoftClientId ?? ""}
                placeholder="00000000-0000-0000-0000-000000000000"
              />
              <SecretField
                label="Client secret"
                name="microsoftClientSecret"
                masked={maskTail(settings.microsoftClientSecret)}
                placeholder="Client secret value"
              />
              <PlainField
                label="Tenant"
                name="microsoftTenant"
                defaultValue={settings.microsoftTenant}
                placeholder="common"
                hint='"common" accepts both personal Outlook/Microsoft accounts and work-or-school accounts.'
              />
            </>
          }
        />

        <Button
          type="submit"
          className="mt-6"
        >
          Save settings
        </Button>
      </form>

      {SECRET_FIELD_NAMES.map((name) => (
        <form key={name} id={`clear-${name}`} action={clearAuthSecretAction}>
          <input type="hidden" name="field" value={name} />
        </form>
      ))}
    </div>
  );
}

function ProviderPanel({
  title,
  ready,
  redirectUriValue,
  setupHref,
  fields,
}: {
  title: string;
  ready: boolean;
  redirectUriValue: string;
  setupHref: string;
  fields: React.ReactNode;
}) {
  return (
    <Card className="mt-8">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base font-semibold text-slate-900">{title}</CardTitle>
        <Badge variant={ready ? "success" : "muted"}>
          {ready ? "Configured" : "Not configured"}
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          <p>
            Create credentials at{" "}
            <a href={setupHref} target="_blank" className="text-indigo-600 hover:underline">
              {setupHref.replace("https://", "")}
            </a>
            , then register this redirect URI:
          </p>
          <code className="mt-1 block break-all rounded bg-white px-2 py-1 text-slate-800">
            {redirectUriValue}
          </code>
        </div>
  
        <div className="mt-4 space-y-4">{fields}</div>
      </CardContent>
    </Card>
  );
}

function PlainField({
  label,
  name,
  defaultValue,
  placeholder,
  hint,
}: {
  label: string;
  name: string;
  defaultValue: string;
  placeholder: string;
  hint?: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
      />
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </div>
  );
}

function SecretField({
  label,
  name,
  masked,
  placeholder,
}: {
  label: string;
  name: string;
  masked: string;
  placeholder: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <span className="text-xs text-slate-400">{masked}</span>
      </div>
      <div className="mt-1 flex gap-2">
        <Input
          name={name}
          type="password"
          autoComplete="off"
          placeholder={placeholder}
          className="flex-1"
        />
        <Button
          type="submit"
          form={`clear-${name}`}
          variant="outline"
          className="shrink-0"
        >
          Clear
        </Button>
      </div>
      <p className="mt-1 text-xs text-slate-400">Leave blank to keep the current value.</p>
    </div>
  );
}
