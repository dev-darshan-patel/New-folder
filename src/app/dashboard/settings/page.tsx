import Link from "next/link";
import { Calendar, Video } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getCalendarConnection, isCalendarConfigurable, hasFreeBusyScope } from "@/lib/google-calendar";
import { getZoomConnection, isZoomConfigurable } from "@/lib/zoom";
import ProfileForm from "./ProfileForm";
import PasswordForm from "./PasswordForm";
import DeleteAccountForm from "./DeleteAccountForm";
import DisconnectButton from "./DisconnectButton";
import AvatarUpload from "@/components/AvatarUpload";
import { disconnectCalendarAction, disconnectZoomAction, toggleBusySyncAction } from "./actions";
import BusySyncToggle from "./BusySyncToggle";
import ApplyForPaymentsForm from "./ApplyForPaymentsForm";
import ProviderPicker from "./ProviderPicker";
import PaymentOnboardingPanel from "./PaymentOnboardingPanel";
import { getDeletionImpact, DELETION_GRACE_HOURS } from "@/lib/account-deletion";
import {
  PAYMENT_ACCOUNT_STATUS,
  SUPPORTED_COUNTRIES,
  countryName,
  tenantEligibleProviders,
} from "@/lib/payments";
import { planHasFeature } from "@/lib/plans";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

function initials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

const CALENDAR_STATUS: Record<string, { text: string; tone: "ok" | "err" }> = {
  connected: { text: "Google Calendar connected. Google Meet event types will now generate links automatically.", tone: "ok" },
  denied: { text: "Calendar connection was cancelled.", tone: "err" },
  error: { text: "Couldn't connect your calendar. Please try again.", tone: "err" },
  not_configured: { text: "Google sign-in isn't configured on this platform yet. Ask the admin to set it up.", tone: "err" },
};

const ZOOM_STATUS: Record<string, { text: string; tone: "ok" | "err" }> = {
  connected: { text: "Zoom connected. Zoom event types will now generate links automatically.", tone: "ok" },
  denied: { text: "Zoom connection was cancelled.", tone: "err" },
  error: { text: "Couldn't connect Zoom. Please try again.", tone: "err" },
  not_configured: { text: "Zoom isn't configured on this platform yet. Ask the admin to set it up.", tone: "err" },
};

const PAYMENTS_STATUS: Record<string, { text: string; tone: "ok" | "err" }> = {
  ready: { text: "Payment provider onboarding complete — you can now set prices on event types.", tone: "ok" },
  pending: { text: "Onboarding is still under review by the provider. Refresh the status once you're notified.", tone: "err" },
  not_started: { text: "You haven't started payment provider onboarding yet.", tone: "err" },
  onboarding_error: { text: "We couldn't start onboarding. Try again or contact support.", tone: "err" },
  status_error: { text: "We couldn't reach the provider. Try again in a moment.", tone: "err" },
  not_approved: { text: "Your payments account isn't approved yet.", tone: "err" },
  provider_ineligible: { text: "That provider isn't available for your country.", tone: "err" },
  invalid_provider: { text: "Unknown payment provider.", tone: "err" },
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ calendar?: string; zoom?: string; payments?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) return null;

  const [connection, calendarConfigurable, zoomConnection, zoomConfigurable, sp, impact, latestPaymentApp, eligibleProvidersForUser, canAcceptPayments, canBusySync] = await Promise.all([
    getCalendarConnection(user.id),
    isCalendarConfigurable(),
    getZoomConnection(user.id),
    isZoomConfigurable(),
    searchParams,
    getDeletionImpact(user.id),
    prisma.paymentApplication.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    }),
    tenantEligibleProviders(user.country),
    planHasFeature(user.plan, "payments"),
    planHasFeature(user.plan, "calendar_busy_sync"),
  ]);
  const calendarStatus = sp.calendar ? CALENDAR_STATUS[sp.calendar] : null;
  const zoomStatus = sp.zoom ? ZOOM_STATUS[sp.zoom] : null;
  const paymentsStatus = sp.payments ? PAYMENTS_STATUS[sp.payments] : null;

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Account settings</h1>
        <p className="mt-1 text-sm text-slate-600">Manage your profile and password.</p>
      </div>

      <Card>
        <CardContent className="p-6">
        <h2 className="font-semibold text-slate-900">Profile</h2>
        <p className="mt-1 text-xs text-slate-500">
          Your email is{" "}
          <span className="font-medium text-slate-700">{user.email}</span>.
        </p>

        <div className="mt-5 border-b border-slate-100 pb-6">
          <AvatarUpload
            currentUrl={user.avatarUrl ?? null}
            initials={initials(user.name)}
          />
        </div>

        <ProfileForm
          initial={{
            name: user.name,
            businessName: user.businessName,
            mobile: user.mobile,
            slug: user.slug,
            timezone: user.timezone,
          }}
        />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
        <h2 className="font-semibold text-slate-900">Password</h2>
        <PasswordForm hasPassword={Boolean(user.passwordHash)} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
        <h2 className="font-semibold text-slate-900">Integrations</h2>
        <p className="mt-1 text-sm text-slate-600">
          Connect Google Calendar or Zoom to auto-generate a video link for online
          event types and add each booking to your calendar.
        </p>

        {calendarStatus && (
          <p
            className={`mt-4 rounded-lg px-3 py-2 text-sm ${
              calendarStatus.tone === "ok"
                ? "bg-green-50 text-green-700"
                : "bg-red-50 text-red-700"
            }`}
          >
            {calendarStatus.text}
          </p>
        )}

        <div className="mt-4 flex items-center justify-between rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600">
              <Calendar size={18} />
            </span>
            <div>
              <p className="text-sm font-medium text-slate-800">Google Calendar</p>
              {connection ? (
                <p className="text-xs text-green-600">
                  Connected{connection.accountEmail ? ` — ${connection.accountEmail}` : ""}
                </p>
              ) : (
                <p className="text-xs text-slate-500">Not connected</p>
              )}
            </div>
          </div>

          {connection ? (
            <DisconnectButton action={disconnectCalendarAction} provider="Google Calendar" />
          ) : calendarConfigurable ? (
            <Button asChild>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- API route that 302-redirects into Google OAuth; must be a real browser navigation */}
              <a href="/api/calendar/google/start">Connect</a>
            </Button>
          ) : (
            <span className="text-xs text-slate-400">Unavailable</span>
          )}
        </div>

        {connection && canBusySync && hasFreeBusyScope(connection.scope) && (
          <BusySyncToggle action={toggleBusySyncAction} initialEnabled={connection.syncBusyTimes} />
        )}
        {connection && canBusySync && !hasFreeBusyScope(connection.scope) && (
          <p className="mt-3 text-xs text-slate-500">
            Reconnect Google Calendar to enable busy-time sync (blocks slots when
            you&apos;re busy elsewhere on your calendar).
          </p>
        )}
        {connection && !canBusySync && (
          <p className="mt-3 text-xs text-slate-500">
            Calendar busy-sync isn&apos;t available on your current plan.{" "}
            <Link href="/dashboard/billing" className="font-medium text-indigo-600 hover:underline">
              See plans
            </Link>
          </p>
        )}

        {zoomStatus && (
          <p
            className={`mt-4 rounded-lg px-3 py-2 text-sm ${
              zoomStatus.tone === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
            }`}
          >
            {zoomStatus.text}
          </p>
        )}

        <div className="mt-4 flex items-center justify-between rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600">
              <Video size={18} />
            </span>
            <div>
              <p className="text-sm font-medium text-slate-800">Zoom</p>
              {zoomConnection ? (
                <p className="text-xs text-green-600">
                  Connected{zoomConnection.accountEmail ? ` — ${zoomConnection.accountEmail}` : ""}
                </p>
              ) : (
                <p className="text-xs text-slate-500">Not connected</p>
              )}
            </div>
          </div>

          {zoomConnection ? (
            <DisconnectButton action={disconnectZoomAction} provider="Zoom" />
          ) : zoomConfigurable ? (
            <Button asChild>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- API route that 302-redirects into Zoom OAuth; must be a real browser navigation */}
              <a href="/api/calendar/zoom/start">Connect</a>
            </Button>
          ) : (
            <span className="text-xs text-slate-400">Unavailable</span>
          )}
        </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <h2 className="font-semibold text-slate-900">Accept payments</h2>
          <p className="mt-1 text-sm text-slate-600">
            Charge customers when they book a paid event type. Applications are reviewed by
            our team before your account can accept payments.
          </p>

          {!canAcceptPayments ? (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-medium text-slate-800">
                Accepting payments isn&apos;t available on your current plan.
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Upgrade to the Business plan to apply.
              </p>
              <Button asChild size="sm" className="mt-3">
                <Link href="/dashboard/billing">See plans</Link>
              </Button>
            </div>
          ) : user.paymentAccountStatus === PAYMENT_ACCOUNT_STATUS.APPROVED ? (
            <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4">
              <p className="text-sm font-medium text-green-800">
                You&apos;re approved to accept payments.
              </p>
              <p className="mt-1 text-sm text-green-700">
                Country: {countryName(user.country ?? "")}.
              </p>
              {paymentsStatus && (
                <p
                  className={`mt-3 rounded-md px-3 py-2 text-sm ${
                    paymentsStatus.tone === "ok"
                      ? "bg-white text-green-800"
                      : "bg-red-50 text-red-700"
                  }`}
                >
                  {paymentsStatus.text}
                </p>
              )}
              <ProviderPicker
                eligible={eligibleProvidersForUser}
                active={user.activePaymentProvider}
              />
              {user.activePaymentProvider === "STRIPE" && (
                <PaymentOnboardingPanel
                  provider="STRIPE"
                  accountId={user.stripeConnectAccountId}
                  ready={user.stripeConnectReady}
                />
              )}
              {user.activePaymentProvider === "RAZORPAY" && (
                <PaymentOnboardingPanel
                  provider="RAZORPAY"
                  accountId={user.razorpayLinkedAccountId}
                  ready={user.razorpayConnectReady}
                />
              )}
            </div>
          ) : user.paymentAccountStatus === PAYMENT_ACCOUNT_STATUS.APPLIED ? (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-medium text-amber-800">
                Application under review.
              </p>
              <p className="mt-1 text-sm text-amber-700">
                We&apos;ll email you at <span className="font-medium">{user.email}</span> as
                soon as a decision is made.
              </p>
            </div>
          ) : user.paymentAccountStatus === PAYMENT_ACCOUNT_STATUS.SUSPENDED ? (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="text-sm font-medium text-red-800">
                Payments are suspended for your account.
              </p>
              <p className="mt-1 text-sm text-red-700">
                Contact support to resolve this.
              </p>
            </div>
          ) : (
            <>
              {latestPaymentApp?.status === "REJECTED" && (
                <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4">
                  <p className="text-sm font-medium text-red-800">
                    Your previous application was declined.
                  </p>
                  {latestPaymentApp.rejectionReason && (
                    <p className="mt-1 text-sm text-red-700">
                      Reason: {latestPaymentApp.rejectionReason}
                    </p>
                  )}
                </div>
              )}
              <ApplyForPaymentsForm countries={SUPPORTED_COUNTRIES} />
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
        <h2 className="font-semibold text-slate-900">Two-factor authentication</h2>
        <p className="mt-1 text-sm text-slate-600">
          {user.totpEnabled
            ? "2FA is enabled on your account."
            : "Add an extra layer of security to every sign-in."}
        </p>
        <Link
          href="/dashboard/settings/security"
          className="mt-3 inline-block text-sm font-medium text-indigo-600 hover:underline"
        >
          {user.totpEnabled ? "Manage 2FA →" : "Enable 2FA →"}
        </Link>
        </CardContent>
      </Card>

      {!user.deletionRequestedAt && (
        <Card className="border-red-200">
          <CardContent className="p-6">
          <h2 className="font-semibold text-red-700">Danger zone</h2>
          <p className="mt-1 text-sm text-slate-600">
            Deleting your account deactivates your booking page after a grace period. You can
            cancel any time before the grace period ends.
          </p>
          <div className="mt-4">
            <DeleteAccountForm
              hasPassword={Boolean(user.passwordHash)}
              slug={user.slug}
              graceHours={DELETION_GRACE_HOURS}
              impact={impact}
            />
          </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
