import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { makeQrDataUrl } from "@/lib/totp";
import { beginTotpSetupAction } from "./actions";
import EnableTotpForm from "./EnableTotpForm";
import DisableTotpForm from "./DisableTotpForm";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default async function SecurityPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Pre-compute the QR data at the top so JSX stays synchronous.
  let qrData: { otpauth: string; qrDataUrl: string } | null = null;
  if (user.totpSecret && !user.totpEnabled) {
    qrData = await makeQrDataUrl({
      secret: user.totpSecret,
      email: user.email,
      appName: "Booking",
    });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Security</h1>
        <p className="mt-1 text-sm text-slate-600">
          Two-factor authentication adds a second step to every sign-in.
        </p>
        <p className="mt-2 text-sm">
          <Link href="/dashboard/settings" className="text-indigo-600 hover:underline">
            ← Account settings
          </Link>
        </p>
      </div>

      {user.totpEnabled ? (
        <section className="rounded-2xl border border-green-200 bg-green-50 p-6">
          <p className="font-medium text-green-800">Two-factor authentication is ON.</p>
          <p className="mt-1 text-sm text-green-700">
            You&apos;ll be asked for a code every time you sign in.
          </p>
          <DisableTotpForm />
        </section>
      ) : qrData && user.totpSecret ? (
        <EnableTotpForm
          secret={user.totpSecret}
          qrDataUrl={qrData.qrDataUrl}
          otpauth={qrData.otpauth}
        />
      ) : (
        <Card>
          <CardContent className="p-6">
          <p className="font-medium text-slate-900">Turn on two-factor auth</p>
          <p className="mt-1 text-sm text-slate-600">
            You&apos;ll scan a QR code in Google Authenticator, Authy, or 1Password.
          </p>
          <form
            action={async () => {
              "use server";
              await beginTotpSetupAction();
            }}
            className="mt-4"
          >
            <Button type="submit">Start setup</Button>
          </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
