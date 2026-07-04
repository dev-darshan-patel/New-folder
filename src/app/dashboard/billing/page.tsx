import { getCurrentUser } from "@/lib/auth";
import { isStripeConfigured } from "@/lib/stripe";
import { getActivePlans, getPlanConfig } from "@/lib/plans";
import {
  createCheckoutAction,
  createPortalAction,
  devSetPlanAction,
} from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{
    success?: string;
    canceled?: string;
    error?: string;
    coupon?: string;
    coupon_error?: string;
  }>;
}) {
  const user = await getCurrentUser();
  if (!user) return null;

  const sp = await searchParams;
  const [current, plans, stripeReady] = await Promise.all([
    getPlanConfig(user.plan),
    getActivePlans(),
    isStripeConfigured(),
  ]);
  const isDev = process.env.NODE_ENV !== "production";

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">
        Plans &amp; Billing
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        You&apos;re on the <span className="font-semibold">{current.name}</span> plan
        {user.planRenewsAt && user.plan !== "FREE" && (
          <> · renews {user.planRenewsAt.toLocaleDateString()}</>
        )}
        .
      </p>

      {sp.success && (
        <Banner tone="green">
          {sp.coupon
            ? `Promo code ${sp.coupon} applied — you're all set!`
            : "Subscription updated — thank you!"}
        </Banner>
      )}
      {sp.canceled && <Banner tone="amber">Checkout canceled.</Banner>}
      {sp.coupon_error && <Banner tone="amber">{sp.coupon_error}</Banner>}
      {(sp.error || (!stripeReady && !isDev)) && (
        <Banner tone="amber">
          Billing isn&apos;t fully configured yet. Add your Stripe keys to enable
          checkout.
        </Banner>
      )}

      <Card className="mt-6">
        <CardContent className="p-4">
          <p className="text-sm font-medium text-slate-700">Promo code</p>
          <p className="mt-1 text-xs text-slate-500">
            Enter a code on upgrade — trial codes activate instantly; Stripe codes apply at
            checkout.
          </p>
        </CardContent>
      </Card>

      <div className="mt-8 grid gap-5 md:grid-cols-3">
        {plans.map((plan) => {
          const planId = plan.id;
          const isCurrent = planId === user.plan;
          return (
            <Card
              key={planId}
              className={`flex flex-col ${
                isCurrent ? "border-indigo-600 ring-1 ring-indigo-600" : ""
              }`}
            >
              <CardHeader className="flex flex-row items-baseline justify-between pb-2">
                <CardTitle className="text-lg">{plan.name}</CardTitle>
                {isCurrent && (
                  <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
                    Current
                  </span>
                )}
              </CardHeader>
              <CardContent className="flex flex-1 flex-col">
                <p className="text-2xl font-bold text-slate-900">{plan.priceLabel}</p>
                <ul className="mt-4 flex-1 space-y-2 text-sm text-slate-600">
                  {plan.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <span className="text-indigo-600">✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
  
                <div className="mt-6">
                  {isCurrent ? (
                    user.plan !== "FREE" && stripeReady ? (
                      <form action={createPortalAction}>
                        <Button variant="outline" className="w-full">
                          Manage subscription
                        </Button>
                      </form>
                    ) : (
                      <Button
                        disabled
                        variant="secondary"
                        className="w-full"
                      >
                        Your plan
                      </Button>
                    )
                  ) : planId === "FREE" ? (
                    <span className="block text-center text-xs text-slate-400">
                      Downgrade via Manage subscription
                    </span>
                  ) : (
                    <form action={createCheckoutAction} className="space-y-2">
                      <input type="hidden" name="plan" value={planId} />
                      <Input
                        name="couponCode"
                        placeholder="Promo code (optional)"
                      />
                      <Button
                        type="submit"
                        className="w-full"
                      >
                        Upgrade to {plan.name}
                      </Button>
                    </form>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {isDev && (
        <Card className="mt-10 border-dashed bg-slate-50">
          <CardContent className="p-5">
            <p className="text-sm font-semibold text-slate-700">
              Dev tools — switch plan without Stripe
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Only visible in development. Use this to test feature gating.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {plans.map((plan) => (
                <form key={plan.id} action={devSetPlanAction}>
                  <input type="hidden" name="plan" value={plan.id} />
                  <Button variant="outline" size="sm">
                    Set {plan.name}
                  </Button>
                </form>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Banner({
  tone,
  children,
}: {
  tone: "green" | "amber";
  children: React.ReactNode;
}) {
  const cls =
    tone === "green"
      ? "bg-green-50 text-green-800"
      : "bg-amber-50 text-amber-800";
  return <p className={`mt-4 rounded-lg px-4 py-3 text-sm ${cls}`}>{children}</p>;
}
