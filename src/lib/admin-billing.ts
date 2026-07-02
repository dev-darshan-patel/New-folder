import "server-only";
import type { Plan } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { planConfig, PLAN_ORDER } from "@/lib/plans";
import { getStripe } from "@/lib/stripe";

export type AtRiskRow = {
  id: string;
  businessName: string;
  email: string;
  plan: Plan;
  subscriptionStatus: string;
  planRenewsAt: Date | null;
  stripeCustomerId: string | null;
};

export type BillingOverview = {
  mrrTotal: number;
  mrrByPlan: { plan: Plan; count: number; mrr: number }[];
  paidCount: number;
  atRisk: AtRiskRow[];
  cancelled30d: number;
};

// Stripe subscription statuses that mean the tenant is in dunning / at risk
// of losing their paid plan.
const AT_RISK_STATUSES = ["past_due", "unpaid", "incomplete", "incomplete_expired"];

export async function getBillingOverview(): Promise<BillingOverview> {
  const [paidUsers, cancelled30d] = await Promise.all([
    prisma.user.findMany({
      where: { plan: { not: "FREE" }, deletedAt: null },
      select: {
        id: true,
        businessName: true,
        email: true,
        plan: true,
        subscriptionStatus: true,
        planRenewsAt: true,
        stripeCustomerId: true,
      },
    }),
    prisma.user.count({
      where: {
        subscriptionStatus: "canceled",
        updatedAt: { gte: new Date(Date.now() - 30 * 86_400_000) },
      },
    }),
  ]);

  const mrrByPlan = PLAN_ORDER.filter((p) => p !== "FREE").map((plan) => {
    const count = paidUsers.filter((u) => u.plan === plan).length;
    return { plan, count, mrr: count * planConfig(plan).priceMonthly };
  });

  const atRisk: AtRiskRow[] = paidUsers
    .filter(
      (u): u is typeof u & { subscriptionStatus: string } =>
        u.subscriptionStatus !== null && AT_RISK_STATUSES.includes(u.subscriptionStatus),
    )
    .sort((a, b) => (a.planRenewsAt?.getTime() ?? 0) - (b.planRenewsAt?.getTime() ?? 0));

  return {
    mrrTotal: mrrByPlan.reduce((s, r) => s + r.mrr, 0),
    mrrByPlan,
    paidCount: paidUsers.length,
    atRisk,
    cancelled30d,
  };
}

export type InvoiceRow = {
  id: string;
  customerEmail: string | null;
  amountDue: number; // in currency units, not cents
  currency: string;
  status: string; // paid | open | void | uncollectible | draft
  created: Date;
  hostedInvoiceUrl: string | null;
};

// Recent invoices straight from Stripe (last 20 across the account).
// Returns null when Stripe is not configured or unreachable.
export async function getRecentInvoices(): Promise<InvoiceRow[] | null> {
  const stripe = await getStripe();
  if (!stripe) return null;
  try {
    const invoices = await stripe.invoices.list({ limit: 20 });
    return invoices.data
      .filter((inv) => Boolean(inv.id))
      .map((inv) => ({
        id: inv.id as string,
        customerEmail: inv.customer_email ?? null,
        amountDue: (inv.amount_due ?? 0) / 100,
        currency: (inv.currency ?? "usd").toUpperCase(),
        status: inv.status ?? "unknown",
        created: new Date(inv.created * 1000),
        hostedInvoiceUrl: inv.hosted_invoice_url ?? null,
      }));
  } catch (err) {
    console.error("Failed to list Stripe invoices", err);
    return null;
  }
}
