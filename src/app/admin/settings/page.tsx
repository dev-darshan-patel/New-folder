import { getCurrentUser } from "@/lib/auth";
import { getPlatformSettings } from "@/lib/settings";
import { isStripeConfigured } from "@/lib/stripe";
import { updateStripeSettingsAction, clearStripeSecretAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const SECRET_FIELD_NAMES = [
  "stripeTestSecretKey",
  "stripeTestWebhookSecret",
  "stripeLiveSecretKey",
  "stripeLiveWebhookSecret",
] as const;

function maskTail(value: string | null): string {
  if (!value) return "Not set";
  return `Set — ends in ${value.slice(-4)}`;
}

export default async function AdminSettingsPage() {
  const viewer = await getCurrentUser();
  if (!viewer || viewer.adminRole !== "SUPER_ADMIN") {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Settings</h1>
        <p className="mt-2 text-sm text-slate-500">
          Platform settings are restricted to Super Admins.
        </p>
      </div>
    );
  }

  const settings = await getPlatformSettings();
  const stripeReady = await isStripeConfigured();

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Stripe settings</h1>
      <p className="mt-1 text-sm text-slate-600">
        Store test and live Stripe credentials. Only one mode is active for the whole
        platform at a time — switching modes never mixes test and live keys.
      </p>

      <div
        className={`mt-4 flex items-center justify-between rounded-lg px-4 py-3 text-sm ${
          stripeReady ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-800"
        }`}
      >
        <span>
          Active mode: <strong>{settings.stripeMode}</strong> ·{" "}
          {stripeReady ? "Stripe is configured and ready." : "No secret key set for this mode."}
        </span>
      </div>

      <form action={updateStripeSettingsAction} className="mt-6 space-y-8">
        <div>
          <label className="block text-sm font-medium text-slate-700">Active mode</label>
          <div className="mt-2 flex gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="radio"
                name="stripeMode"
                value="TEST"
                defaultChecked={settings.stripeMode === "TEST"}
                className="h-4 w-4 border-slate-300 text-indigo-600"
              />
              Test mode
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="radio"
                name="stripeMode"
                value="LIVE"
                defaultChecked={settings.stripeMode === "LIVE"}
                className="h-4 w-4 border-slate-300 text-indigo-600"
              />
              Live mode
            </label>
          </div>
        </div>

        <ModePanel
          title="Test mode keys"
          desc="From dashboard.stripe.com/test/apikeys — safe to use freely, no real charges."
          prefix="stripeTest"
          publishableKey={settings.stripeTestPublishableKey}
          secretKeyMasked={maskTail(settings.stripeTestSecretKey)}
          webhookSecretMasked={maskTail(settings.stripeTestWebhookSecret)}
          pricePro={settings.stripeTestPricePro}
          priceBusiness={settings.stripeTestPriceBusiness}
        />

        <ModePanel
          title="Live mode keys"
          desc="From dashboard.stripe.com/apikeys — real charges. Only switch to Live mode when you're ready to accept real payments."
          prefix="stripeLive"
          publishableKey={settings.stripeLivePublishableKey}
          secretKeyMasked={maskTail(settings.stripeLiveSecretKey)}
          webhookSecretMasked={maskTail(settings.stripeLiveWebhookSecret)}
          pricePro={settings.stripeLivePricePro}
          priceBusiness={settings.stripeLivePriceBusiness}
        />

        <Button
          type="submit"
          className="mt-6"
        >
          Save settings
        </Button>
      </form>

      {/* Standalone forms for the inline "Clear" buttons. These sit outside
          (siblings of) the main settings form — a <form> cannot nest inside
          another <form> in valid HTML — and are targeted via the button's
          `form="..."` attribute instead. */}
      {SECRET_FIELD_NAMES.map((name) => (
        <form key={name} id={`clear-${name}`} action={clearStripeSecretAction}>
          <input type="hidden" name="field" value={name} />
        </form>
      ))}
    </div>
  );
}

function ModePanel({
  title,
  desc,
  prefix,
  publishableKey,
  secretKeyMasked,
  webhookSecretMasked,
  pricePro,
  priceBusiness,
}: {
  title: string;
  desc: string;
  prefix: "stripeTest" | "stripeLive";
  publishableKey: string | null;
  secretKeyMasked: string;
  webhookSecretMasked: string;
  pricePro: string | null;
  priceBusiness: string | null;
}) {
  return (
    <Card className="mt-8">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{desc}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Publishable key</Label>
          <Input
            name={`${prefix}PublishableKey`}
            defaultValue={publishableKey ?? ""}
            placeholder="pk_..."
          />
        </div>

        <SecretField
          label="Secret key"
          name={`${prefix}SecretKey`}
          masked={secretKeyMasked}
          placeholder="sk_..."
        />

        <SecretField
          label="Webhook signing secret"
          name={`${prefix}WebhookSecret`}
          masked={webhookSecretMasked}
          placeholder="whsec_..."
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Price ID — Pro plan</Label>
            <Input
              name={`${prefix}PricePro`}
              defaultValue={pricePro ?? ""}
              placeholder="price_..."
            />
          </div>
          <div className="space-y-2">
            <Label>Price ID — Business plan</Label>
            <Input
              name={`${prefix}PriceBusiness`}
              defaultValue={priceBusiness ?? ""}
              placeholder="price_..."
            />
          </div>
        </div>
      </CardContent>
    </Card>
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
