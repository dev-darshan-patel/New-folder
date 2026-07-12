import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPlatformSettings } from "@/lib/settings";
import { Card, CardContent } from "@/components/ui/card";
import {
  PAYMENT_ACCOUNT_STATUS,
  PAYMENT_APPLICATION_STATUS,
  countryName,
} from "@/lib/payments";
import PendingApplicationRow from "./PendingApplicationRow";
import SuspendTenantRow from "./SuspendTenantRow";
import PaymentsConfigForm from "./PaymentsConfigForm";
import RazorpaySettingsForm from "./RazorpaySettingsForm";
import RetryPayoutButton from "./RetryPayoutButton";
import RefundButton from "./RefundButton";

const dateFmt = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

export default async function AdminPaymentsPage() {
  // Every mutation in this area requires SUPER_ADMIN; the view is safe for
  // SUPPORT/READ_ONLY, but non-admins should never see it.
  const user = await getCurrentUser();
  if (!user || !user.adminRole) notFound();

  const [pending, tenants, settings, failedPayouts, ledger] = await Promise.all([
    prisma.paymentApplication.findMany({
      where: { status: PAYMENT_APPLICATION_STATUS.PENDING },
      include: { user: { select: { businessName: true, email: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.user.findMany({
      where: {
        paymentAccountStatus: {
          in: [PAYMENT_ACCOUNT_STATUS.APPROVED, PAYMENT_ACCOUNT_STATUS.SUSPENDED],
        },
      },
      select: {
        id: true,
        businessName: true,
        email: true,
        country: true,
        paymentAccountStatus: true,
      },
      orderBy: { businessName: "asc" },
    }),
    getPlatformSettings(),
    // Failed payouts across all tenants — either mid-retry (attempts < 5) or
    // stuck at the retry cap (needs manual admin action). Newest first so
    // recent breakages surface immediately.
    prisma.booking.findMany({
      where: { payoutStatus: "RELEASE_FAILED" },
      include: {
        user: { select: { businessName: true, email: true } },
        eventType: { select: { title: true } },
      },
      orderBy: { endTime: "desc" },
      take: 50,
    }),
    // Ledger: every paid booking regardless of payout state, newest first —
    // the manual-refund surface for both HELD and RELEASED payments.
    prisma.booking.findMany({
      where: { paymentStatus: { in: ["PAID", "REFUNDED"] } },
      include: {
        user: { select: { businessName: true, email: true } },
        eventType: { select: { title: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Payments</h1>
        <p className="mt-1 text-sm text-slate-600">
          Approve applications and manage payment access across tenants.
        </p>
      </div>

      {user.adminRole === "SUPER_ADMIN" && (
        <>
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Platform config
            </h2>
            <Card className="mt-3">
              <CardContent className="p-6">
                <PaymentsConfigForm
                  stripeForIndiaEnabled={settings.stripeForIndiaEnabled}
                  paymentFeePercent={settings.paymentFeePercent}
                />
              </CardContent>
            </Card>
          </section>

          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Razorpay credentials
            </h2>
            <Card className="mt-3">
              <CardContent className="p-6">
                <RazorpaySettingsForm
                  mode={settings.razorpayMode}
                  testKeyId={settings.razorpayTestKeyId}
                  testKeySecret={settings.razorpayTestKeySecret}
                  testWebhookSecret={settings.razorpayTestWebhookSecret}
                  liveKeyId={settings.razorpayLiveKeyId}
                  liveKeySecret={settings.razorpayLiveKeySecret}
                  liveWebhookSecret={settings.razorpayLiveWebhookSecret}
                />
              </CardContent>
            </Card>
          </section>
        </>
      )}

      {failedPayouts.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-red-600">
            Failed payouts ({failedPayouts.length})
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Release attempts that hit an error. Fix the underlying cause (finish
            tenant onboarding, correct the bank account) then click Retry.
            Attempts hard-capped at 5 to prevent runaway loops.
          </p>
          <Card className="mt-3">
            <CardContent className="p-0">
              {failedPayouts.map((b) => (
                <div key={b.id} className="border-b border-slate-100 p-4 last:border-b-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <p className="font-medium text-slate-900">
                        {b.user.businessName} · {b.eventType.title}
                      </p>
                      <p className="text-xs text-slate-500">
                        {b.user.email} · {b.paymentProvider} ·{" "}
                        {b.amountCents != null && b.currency
                          ? `${(b.amountCents / 100).toFixed(2)} ${b.currency}`
                          : "amount unknown"}
                        {" · "}
                        {b.payoutAttempts}/5 attempts
                      </p>
                    </div>
                    <RetryPayoutButton bookingId={b.id} />
                  </div>
                  {b.payoutFailureReason && (
                    <p className="mt-2 rounded bg-red-50 p-2 text-xs text-red-700">
                      {b.payoutFailureReason}
                    </p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      )}

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Payments ledger ({ledger.length})
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Recent paid bookings across all tenants. Refund works whether the
          payout is still held on the platform or already released to the
          tenant — reversed first if needed.
        </p>
        <Card className="mt-3">
          <CardContent className="p-0">
            {ledger.length === 0 ? (
              <p className="p-6 text-sm text-slate-500">No paid bookings yet.</p>
            ) : (
              ledger.map((b) => (
                <div key={b.id} className="border-b border-slate-100 p-4 last:border-b-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <p className="font-medium text-slate-900">
                        {b.user.businessName} · {b.eventType.title}
                      </p>
                      <p className="text-xs text-slate-500">
                        {b.inviteeEmail} · {b.paymentProvider} ·{" "}
                        {b.amountCents != null && b.currency
                          ? `${(b.amountCents / 100).toFixed(2)} ${b.currency}`
                          : "—"}
                        {" · "}
                        payout: {b.payoutStatus ?? "—"}
                        {" · "}
                        {dateFmt.format(b.createdAt)}
                      </p>
                    </div>
                    {b.paymentStatus === "PAID" ? (
                      <RefundButton bookingId={b.id} />
                    ) : (
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                        Refunded
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Pending applications ({pending.length})
        </h2>
        <Card className="mt-3">
          <CardContent className="p-0">
            {pending.length === 0 ? (
              <p className="p-6 text-sm text-slate-500">
                No applications waiting. New submissions will appear here.
              </p>
            ) : (
              pending.map((app) => (
                <PendingApplicationRow
                  key={app.id}
                  id={app.id}
                  businessName={app.user.businessName}
                  email={app.user.email}
                  country={countryName(app.country)}
                  businessDescription={app.businessDescription}
                  expectedPriceRange={app.expectedPriceRange}
                  appliedAt={dateFmt.format(app.createdAt)}
                />
              ))
            )}
          </CardContent>
        </Card>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Approved / suspended tenants ({tenants.length})
        </h2>
        <Card className="mt-3">
          <CardContent className="p-0">
            {tenants.length === 0 ? (
              <p className="p-6 text-sm text-slate-500">
                No tenants have been approved for payments yet.
              </p>
            ) : (
              tenants.map((t) => (
                <SuspendTenantRow
                  key={t.id}
                  userId={t.id}
                  businessName={t.businessName}
                  email={t.email}
                  country={countryName(t.country ?? "")}
                  status={t.paymentAccountStatus as "APPROVED" | "SUSPENDED"}
                />
              ))
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
