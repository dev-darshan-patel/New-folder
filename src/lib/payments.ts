import "server-only";
import { getPlatformSettings } from "@/lib/settings";
import type { PaymentProvider } from "@/lib/payments/provider";

export type { PaymentProvider };

// Tenant-facing states for Feature 4 (payments). Kept as string constants
// rather than a Prisma enum to match the codebase convention (booking status,
// admin role migration, etc.) — easier to extend without a schema migration.
export const PAYMENT_ACCOUNT_STATUS = {
  NONE: "NONE",
  APPLIED: "APPLIED",
  APPROVED: "APPROVED",
  SUSPENDED: "SUSPENDED",
} as const;

export const PAYMENT_APPLICATION_STATUS = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
} as const;

// The plan tier gated to accept payments (per product decision). Kept here so
// every gate check reads from one place — swapping to a different tier or a
// per-plan flag later is a single edit.
export const PAYMENTS_REQUIRED_PLAN = "BUSINESS";

// Which provider a tenant is eligible for based on their declared country.
// India = Razorpay only unless the platform Stripe-for-India flag is on;
// everywhere else = Stripe only. See Feature 4 plan.
export function eligibleProviders(country: string, stripeForIndiaEnabled: boolean): PaymentProvider[] {
  if (country === "IN") {
    return stripeForIndiaEnabled ? ["RAZORPAY", "STRIPE"] : ["RAZORPAY"];
  }
  return ["STRIPE"];
}

// Full eligibility for a tenant, resolved against live platform settings.
// Callers use this everywhere instead of eligibleProviders() so they don't
// have to remember to load the settings row themselves.
export async function tenantEligibleProviders(country: string | null): Promise<PaymentProvider[]> {
  if (!country) return [];
  const settings = await getPlatformSettings();
  return eligibleProviders(country, settings.stripeForIndiaEnabled);
}

// A provider switch is allowed only when the tenant has no money in flight on
// the current provider — HELD funds or in-progress PENDING_PAYMENT holds.
// Historical bookings permanently keep the provider they were paid through;
// this check is what enforces "at any moment, at most one active provider
// per tenant."
//
// Phase 4.5 introduces PENDING_PAYMENT / paymentStatus / payoutStatus on
// Booking and will make this check meaningful. Today there are no payments
// so nothing can be in flight — the check is a stable no-op. The signature
// is deliberately future-proof so nothing wired up now needs to change.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function canSwitchPaymentProvider(_userId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  return { ok: true };
}

// A minimal country list for the application form. ISO 3166-1 alpha-2 codes.
// Extend as we onboard more markets; the eligibility matrix only cares whether
// the code is "IN" or not, so any addition is safe.
export const SUPPORTED_COUNTRIES: { code: string; name: string }[] = [
  { code: "IN", name: "India" },
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "SG", name: "Singapore" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "NL", name: "Netherlands" },
];

export function countryName(code: string): string {
  return SUPPORTED_COUNTRIES.find((c) => c.code === code)?.name ?? code;
}

// v1 currency policy (Feature 4.4). Razorpay tenants price in INR because
// Razorpay Route only settles rupees to Indian merchants. Stripe tenants
// price in their country's default currency. Kept in one place so a country
// gaining native currency support later is a single edit.
const STRIPE_COUNTRY_CURRENCY: Record<string, string> = {
  US: "USD",
  GB: "GBP",
  CA: "CAD",
  AU: "AUD",
  DE: "EUR",
  FR: "EUR",
  NL: "EUR",
  SG: "SGD",
  AE: "AED",
  IN: "INR",
};

export function currencyForProvider(provider: PaymentProvider, country: string | null): string {
  if (provider === "RAZORPAY") return "INR";
  return STRIPE_COUNTRY_CURRENCY[country ?? ""] ?? "USD";
}

// Smallest-unit multiplier per currency. Every currency we support is a
// 100-minor-unit currency today — kept explicit so a zero-decimal currency
// (JPY, KRW) added later doesn't silently mis-price 100x too big.
const MINOR_UNITS: Record<string, number> = {
  USD: 100, GBP: 100, EUR: 100, CAD: 100, AUD: 100, SGD: 100, AED: 100, INR: 100,
};

export function currencyMinorUnits(currency: string): number {
  return MINOR_UNITS[currency] ?? 100;
}

export function formatPrice(cents: number, currency: string): string {
  const units = currencyMinorUnits(currency);
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / units);
}

// A tenant may set a paid price only when they're APPROVED for payments AND
// have finished hosted onboarding on their active provider. This is enforced
// server-side in updateEventTypeAction — the UI just hides the field otherwise.
export type PricingEligibility =
  | { canPrice: true; provider: PaymentProvider; currency: string }
  | { canPrice: false; reason: string };

export function pricingEligibility(user: {
  paymentAccountStatus: string;
  activePaymentProvider: string | null;
  country: string | null;
  stripeConnectReady: boolean;
  razorpayConnectReady: boolean;
}): PricingEligibility {
  if (user.paymentAccountStatus !== PAYMENT_ACCOUNT_STATUS.APPROVED) {
    return { canPrice: false, reason: "Your payments account isn't approved." };
  }
  const provider = user.activePaymentProvider;
  if (provider !== "STRIPE" && provider !== "RAZORPAY") {
    return { canPrice: false, reason: "Pick a payment provider before setting a price." };
  }
  const ready = provider === "STRIPE" ? user.stripeConnectReady : user.razorpayConnectReady;
  if (!ready) {
    return { canPrice: false, reason: "Finish provider onboarding before setting a price." };
  }
  return { canPrice: true, provider, currency: currencyForProvider(provider, user.country) };
}
