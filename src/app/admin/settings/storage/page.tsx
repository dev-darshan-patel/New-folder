import { getCurrentUser } from "@/lib/auth";
import { getPlatformSettings } from "@/lib/settings";
import { updateStorageSettingsAction, clearStorageSecretAction, testStorageConnectionAction } from "./actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import TestStorageButton from "./TestStorageButton";

const SECRET_FIELD_NAMES = ["vercelBlobReadWriteToken", "s3SecretAccessKey"] as const;

function maskTail(value: string | null): string {
  if (!value) return "Not set";
  return `Set — ends in ${value.slice(-4)}`;
}

export default async function AdminStorageSettingsPage() {
  const viewer = await getCurrentUser();
  if (!viewer || viewer.adminRole !== "SUPER_ADMIN") {
    return (
      <div className="mx-auto max-w-6xl">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">File storage</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Platform settings are restricted to Super Admins.
        </p>
      </div>
    );
  }

  const settings = await getPlatformSettings();

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-bold tracking-tight text-foreground">File storage</h1>
      <p className="mt-1 text-sm text-slate-600">
        Where uploaded files (currently just avatars) are stored. Leave everything below
        unset for the zero-config local-disk fallback, which works for development but
        doesn&rsquo;t persist across deploys on most hosts.
      </p>

      <form action={updateStorageSettingsAction} className="mt-6 space-y-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold text-foreground">Active provider</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Provider</Label>
              <NativeSelect name="storageProvider" defaultValue={settings.storageProvider}>
                <option value="AUTO">Auto-detect (S3 → Vercel Blob → local disk)</option>
                <option value="LOCAL">Local disk (dev only)</option>
                <option value="VERCEL_BLOB">Vercel Blob</option>
                <option value="S3">S3 / S3-compatible</option>
              </NativeSelect>
              <p className="text-xs text-slate-400">
                &ldquo;Auto-detect&rdquo; uses whichever of Vercel Blob or S3 has credentials set below
                (falling back to env vars, then local disk) — the safe default if you&rsquo;re not sure.
                Forcing a specific provider is only useful if more than one is configured at once
                and auto-detection would pick the wrong one.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold text-foreground">Vercel Blob</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-slate-400">
              On Vercel, attaching a Blob store injects the token automatically — you only need to
              set this if you&rsquo;re using Vercel Blob from somewhere else.
            </p>
            <SecretField
              label="Read-write token"
              name="vercelBlobReadWriteToken"
              masked={maskTail(settings.vercelBlobReadWriteToken)}
              placeholder="vercel_blob_rw_..."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold text-foreground">S3 / S3-compatible</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-slate-400">
              Works with AWS S3 or any S3-compatible provider — Cloudflare R2, DigitalOcean Spaces,
              Backblaze B2, MinIO. Leave Endpoint blank for real AWS S3.
            </p>
            <PlainField label="Bucket" name="s3Bucket" defaultValue={settings.s3Bucket ?? ""} placeholder="my-app-uploads" />
            <PlainField label="Region" name="s3Region" defaultValue={settings.s3Region} placeholder="auto" />
            <PlainField
              label="Endpoint"
              name="s3Endpoint"
              defaultValue={settings.s3Endpoint ?? ""}
              placeholder="https://<account>.r2.cloudflarestorage.com"
              hint="Required for R2/Spaces/B2/MinIO. Leave blank for real AWS S3."
            />
            <PlainField label="Access key ID" name="s3AccessKeyId" defaultValue={settings.s3AccessKeyId ?? ""} placeholder="AKIA..." />
            <SecretField
              label="Secret access key"
              name="s3SecretAccessKey"
              masked={maskTail(settings.s3SecretAccessKey)}
              placeholder="Secret access key"
            />
            <PlainField
              label="Public URL base"
              name="s3PublicUrlBase"
              defaultValue={settings.s3PublicUrlBase ?? ""}
              placeholder="https://pub-xxxx.r2.dev"
              hint="Required for R2/Spaces, which don't serve bucket contents over plain HTTPS by default — use a custom domain or public-bucket URL. Leave blank for AWS S3's own virtual-hosted URL."
            />
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                name="s3ForcePathStyle"
                defaultChecked={settings.s3ForcePathStyle}
                className="h-4 w-4 rounded border-input"
              />
              Force path-style URLs (needed for MinIO and some self-hosted setups)
            </label>
          </CardContent>
        </Card>

        <SubmitButton className="mt-6">Save settings</SubmitButton>
      </form>

      <div className="mt-6 rounded-lg border border-border p-4">
        <p className="text-sm text-foreground">
          Test connection <span className="text-slate-400">— tests the currently saved config, not unsaved edits above</span>
        </p>
        <div className="mt-2">
          <TestStorageButton action={testStorageConnectionAction} />
        </div>
      </div>

      {SECRET_FIELD_NAMES.map((name) => (
        <form key={name} id={`clear-${name}`} action={clearStorageSecretAction}>
          <input type="hidden" name="field" value={name} />
        </form>
      ))}
    </div>
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
      <Input name={name} defaultValue={defaultValue} placeholder={placeholder} />
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
        <Input name={name} type="password" autoComplete="off" placeholder={placeholder} className="flex-1" />
        <SubmitButton form={`clear-${name}`} variant="outline" className="shrink-0">
          Clear
        </SubmitButton>
      </div>
      <p className="mt-1 text-xs text-slate-400">Leave blank to keep the current value.</p>
    </div>
  );
}
