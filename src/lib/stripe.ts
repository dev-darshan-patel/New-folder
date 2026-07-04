import "server-only";
import Stripe from "stripe";
import type { StripeMode } from "@prisma/client";
import { getPlatformSettings } from "@/lib/settings";
import { getAllPlans, getPlanConfig, type Plan } from "@/lib/plans";

export type ActiveStripeConfig = {
  mode: StripeMode;
  publishableKey: string | null;
  secretKey: string | null;
  webhookSecret: string | null;
  pricePro: string | null;
  priceBusiness: string | null;
};

// Resolve the currently-active Stripe configuration. The two modes never mix:
// whichever mode is selected, only that mode's credentials are used — there
// is no falling back to the other mode's keys. Env vars are a legacy/
// zero-config fallback for TEST mode only, used solely when no DB value is set.
export async function getActiveStripeConfig(): Promise<ActiveStripeConfig> {
  const settings = await getPlatformSettings();

  if (settings.stripeMode === "LIVE") {
    return {
      mode: "LIVE",
      publishableKey: settings.stripeLivePublishableKey,
      secretKey: settings.stripeLiveSecretKey,
      webhookSecret: settings.stripeLiveWebhookSecret,
      pricePro: settings.stripeLivePricePro,
      priceBusiness: settings.stripeLivePriceBusiness,
    };
  }

  return {
    mode: "TEST",
    publishableKey: settings.stripeTestPublishableKey,
    secretKey: settings.stripeTestSecretKey || process.env.STRIPE_SECRET_KEY || null,
    webhookSecret: settings.stripeTestWebhookSecret || process.env.STRIPE_WEBHOOK_SECRET || null,
    pricePro: settings.stripeTestPricePro || process.env.STRIPE_PRICE_PRO || null,
    priceBusiness: settings.stripeTestPriceBusiness || process.env.STRIPE_PRICE_BUSINESS || null,
  };
}

// A fresh Stripe client for the active mode, or null if that mode has no
// secret key configured (the billing UI shows a "not configured" state).
export async function getStripe(): Promise<Stripe | null> {
  const { secretKey } = await getActiveStripeConfig();
  if (!secretKey) return null;
  return new Stripe(secretKey);
}

export async function isStripeConfigured(): Promise<boolean> {
  const { secretKey } = await getActiveStripeConfig();
  return Boolean(secretKey);
}

// Resolve the Stripe Price ID for a paid plan, or null. Prefers the plan's own
// stripePriceId (admin-editable); falls back to the legacy platform-settings
// price IDs for the built-in PRO/BUSINESS tiers.
export async function getStripePriceForPlan(plan: Plan): Promise<string | null> {
  const planCfg = await getPlanConfig(plan);
  if (planCfg.stripePriceId) return planCfg.stripePriceId;
  const cfg = await getActiveStripeConfig();
  if (plan === "PRO") return cfg.pricePro;
  if (plan === "BUSINESS") return cfg.priceBusiness;
  return null;
}

// Map a Stripe Price ID (from a webhook event) back to a plan id. Checks each
// plan's stripePriceId first, then the legacy platform-settings price IDs.
export async function getPlanForStripePrice(priceId: string): Promise<Plan | null> {
  const plans = await getAllPlans();
  const match = plans.find((p) => p.stripePriceId && p.stripePriceId === priceId);
  if (match) return match.id;
  const cfg = await getActiveStripeConfig();
  if (cfg.pricePro && priceId === cfg.pricePro) return "PRO";
  if (cfg.priceBusiness && priceId === cfg.priceBusiness) return "BUSINESS";
  return null;
}
