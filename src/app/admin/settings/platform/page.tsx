import { getCurrentUser } from "@/lib/auth";
import { getPlatformSettings } from "@/lib/settings";
import { updatePlatformConfigAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

export default async function AdminPlatformConfigPage() {
  const viewer = await getCurrentUser();
  if (!viewer || viewer.adminRole !== "SUPER_ADMIN") {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Platform config</h1>
        <p className="mt-2 text-sm text-slate-500">
          Platform settings are restricted to Super Admins.
        </p>
      </div>
    );
  }

  const settings = await getPlatformSettings();

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Platform config</h1>
      <p className="mt-1 text-sm text-slate-600">
        Operational switches for the whole platform — maintenance mode, signups, and support
        contact.
      </p>

      <form action={updatePlatformConfigAction} className="mt-6 space-y-6">
        <Card>
          <CardContent className="space-y-4 p-5">
            <Toggle
              name="maintenanceMode"
              label="Maintenance mode"
              hint="When on, public booking pages show a maintenance message. Dashboard and admin still work."
              defaultChecked={settings.maintenanceMode}
            />
            <div className="space-y-2">
              <Label>Maintenance message</Label>
              <Textarea
                name="maintenanceMessage"
                rows={2}
                defaultValue={settings.maintenanceMessage ?? ""}
                placeholder="We're performing scheduled maintenance. Booking will be back shortly."
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 p-5">
            <Toggle
              name="signupsEnabled"
              label="Allow new signups"
              hint="When off, the signup page is disabled. Existing users can still log in."
              defaultChecked={settings.signupsEnabled}
            />
            <div className="space-y-2">
              <Label>Support email</Label>
              <Input
                name="supportEmail"
                type="email"
                defaultValue={settings.supportEmail ?? ""}
                placeholder="support@example.com"
              />
              <span className="mt-1 block text-xs text-slate-400">
                Shown on maintenance and signup-disabled screens.
              </span>
            </div>
          </CardContent>
        </Card>

        <Button
          type="submit"
        >
          Save config
        </Button>
      </form>
    </div>
  );
}

function Toggle({
  name,
  label,
  hint,
  defaultChecked,
}: {
  name: string;
  label: string;
  hint: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex items-start gap-3">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600"
      />
      <span>
        <span className="block text-sm font-medium text-slate-700">{label}</span>
        <span className="block text-xs text-slate-400">{hint}</span>
      </span>
    </label>
  );
}
