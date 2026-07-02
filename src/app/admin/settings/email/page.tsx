import { requireAdminRole } from "@/lib/admin-auth";
import { getPlatformSettings } from "@/lib/settings";
import {
  updateEmailSettingsAction,
  clearEmailSecretAction,
  sendTestEmailAction,
} from "./actions";
import TestEmailButton from "./TestEmailButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

function maskTail(value: string | null): string {
  if (!value) return "Not set";
  return `Set — ends in ${value.slice(-4)}`;
}



export default async function EmailSettingsPage() {
  try {
    await requireAdminRole("SUPER_ADMIN");
  } catch {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Email settings</h1>
        <p className="mt-2 text-sm text-slate-500">Restricted to Super Admins.</p>
      </div>
    );
  }

  const settings = await getPlatformSettings();
  const provider = settings.emailProvider ?? "NONE";

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Email settings</h1>
      <p className="mt-1 text-sm text-slate-600">
        Choose one email provider for outgoing booking confirmations, reminders, and
        notifications. Only one provider is active at a time.
      </p>

      <form action={updateEmailSettingsAction} className="mt-6 space-y-6">
        {/* Provider selector */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Active provider</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              {(["NONE", "GMAIL_SMTP", "AMAZON_SES"] as const).map((p) => (
                <label key={p} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="radio"
                    name="emailProvider"
                    value={p}
                    defaultChecked={provider === p}
                    className="h-4 w-4 border-slate-300 text-indigo-600"
                  />
                  {p === "NONE"
                    ? "None (log to console)"
                    : p === "GMAIL_SMTP"
                      ? "Gmail SMTP"
                      : "Amazon SES"}
                </label>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Gmail SMTP */}
        <Card>
          <CardHeader>
            <CardTitle>Gmail SMTP</CardTitle>
            <CardDescription>
              Use a Google account with an App Password (not your regular password). Create one
              at myaccount.google.com → Security → 2-Step Verification → App passwords.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Gmail address</Label>
              <Input
                name="gmailSmtpUser"
                type="email"
                defaultValue={settings.gmailSmtpUser ?? ""}
                placeholder="you@gmail.com"
              />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label>App password</Label>
                <span className="text-xs text-slate-400">{maskTail(settings.gmailSmtpPass)}</span>
              </div>
              <div className="mt-1 flex gap-2">
                <Input
                  name="gmailSmtpPass"
                  type="password"
                  autoComplete="off"
                  placeholder="16-character app password (no spaces)"
                  className="flex-1"
                />
                <Button
                  type="submit"
                  form="clear-gmailSmtpPass"
                  variant="outline"
                  className="shrink-0"
                >
                  Clear
                </Button>
              </div>
              <p className="mt-1 text-xs text-slate-400">Leave blank to keep the current value.</p>
            </div>
            <div className="space-y-2">
              <Label>From address (optional)</Label>
              <Input
                name="gmailSmtpFrom"
                defaultValue={settings.gmailSmtpFrom ?? ""}
                placeholder={`Booking <you@gmail.com>`}
              />
              <p className="text-xs text-slate-400">
                Defaults to &ldquo;Booking &lt;gmail address&gt;&rdquo; if left blank.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Amazon SES */}
        <Card>
          <CardHeader>
            <CardTitle>Amazon SES</CardTitle>
            <CardDescription>
              Use SES SMTP credentials (not IAM keys). Generate them at AWS Console → IAM →
              your user → Security credentials → Create SMTP credentials. Your domain or from
              address must be verified in SES.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>AWS region</Label>
              <Input
                name="sesRegion"
                defaultValue={settings.sesRegion ?? ""}
                placeholder="us-east-1"
              />
            </div>
            <div className="space-y-2">
              <Label>SMTP username</Label>
              <Input
                name="sesSmtpUser"
                defaultValue={settings.sesSmtpUser ?? ""}
                placeholder="AKIA..."
              />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label>SMTP password</Label>
                <span className="text-xs text-slate-400">{maskTail(settings.sesSmtpPass)}</span>
              </div>
              <div className="mt-1 flex gap-2">
                <Input
                  name="sesSmtpPass"
                  type="password"
                  autoComplete="off"
                  placeholder="SES SMTP password"
                  className="flex-1"
                />
                <Button
                  type="submit"
                  form="clear-sesSmtpPass"
                  variant="outline"
                  className="shrink-0"
                >
                  Clear
                </Button>
              </div>
              <p className="mt-1 text-xs text-slate-400">Leave blank to keep the current value.</p>
            </div>
            <div className="space-y-2">
              <Label>From address</Label>
              <Input
                name="sesFromAddress"
                defaultValue={settings.sesFromAddress ?? ""}
                placeholder="Booking <no-reply@yourdomain.com>"
              />
              <p className="text-xs text-slate-400">
                Must be a verified address or domain in your SES account.
              </p>
            </div>
          </CardContent>
        </Card>

        <Button
          type="submit"
        >
          Save settings
        </Button>
      </form>

      {/* Clear-secret side-forms (outside the main form — can't nest forms) */}
      <form id="clear-gmailSmtpPass" action={clearEmailSecretAction}>
        <input type="hidden" name="field" value="gmailSmtpPass" />
      </form>
      <form id="clear-sesSmtpPass" action={clearEmailSecretAction}>
        <input type="hidden" name="field" value="sesSmtpPass" />
      </form>

      {/* Test email section */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Test delivery</CardTitle>
          <CardDescription>
            Enter any email address and send a test using the currently saved provider.
            Save your settings above before testing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TestEmailButton action={sendTestEmailAction} />
        </CardContent>
      </Card>
    </div>
  );
}
