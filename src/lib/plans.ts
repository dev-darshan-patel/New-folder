import { cache } from "react";
import { prisma } from "@/lib/prisma";

// Plans are now admin-editable rows (see the Plan model). A plan id is just a
// string; "FREE" is the reserved system plan that always exists.
export type Plan = string;

export type PlanConfig = {
  id: string;
  name: string;
  // Display price, e.g. "$12/mo".
  priceLabel: string;
  // Numeric monthly price in USD, for revenue/MRR math.
  priceMonthly: number;
  // Max number of active event types. null = unlimited.
  maxEventTypes: number | null;
  // Whether custom booking-page branding (color/font/logo) is allowed.
  customBranding: boolean;
  // Whether team scheduling (round-robin & collective) is available.
  teamScheduling: boolean;
  features: string[];
  // Stripe recurring Price ID; null for free plans.
  stripePriceId: string | null;
  active: boolean;
  sortOrder: number;
  isSystem: boolean;
};

// Shipped defaults — used to seed the Plan table on first run and as a fallback
// when the DB is unreachable (e.g. build-time prerender).
export const DEFAULT_PLANS: PlanConfig[] = [
  {
    id: "FREE",
    name: "Free",
    priceLabel: "$0",
    priceMonthly: 0,
    maxEventTypes: 1,
    customBranding: false,
    teamScheduling: false,
    features: ["1 event type", "Unlimited bookings", "Email confirmations"],
    stripePriceId: null,
    active: true,
    sortOrder: 0,
    isSystem: true,
  },
  {
    id: "PRO",
    name: "Pro",
    priceLabel: "$12/mo",
    priceMonthly: 12,
    maxEventTypes: 10,
    customBranding: true,
    teamScheduling: false,
    features: [
      "Up to 10 event types",
      "Everything in Free",
      "Custom booking-page branding",
      "Embeddable booking widget",
      "Priority support",
    ],
    stripePriceId: null,
    active: true,
    sortOrder: 1,
    isSystem: false,
  },
  {
    id: "BUSINESS",
    name: "Business",
    priceLabel: "$29/mo",
    priceMonthly: 29,
    maxEventTypes: null,
    customBranding: true,
    teamScheduling: true,
    features: [
      "Unlimited event types",
      "Everything in Pro",
      "Team scheduling (round-robin & collective)",
      "Calendar sync (coming soon)",
    ],
    stripePriceId: null,
    active: true,
    sortOrder: 2,
    isSystem: false,
  },
];

function toConfig(row: {
  id: string;
  name: string;
  priceLabel: string;
  priceMonthly: number;
  maxEventTypes: number | null;
  customBranding: boolean;
  teamScheduling: boolean;
  features: string[];
  stripePriceId: string | null;
  active: boolean;
  sortOrder: number;
  isSystem: boolean;
}): PlanConfig {
  return { ...row };
}

// Seed the shipped defaults (create-only; never clobbers admin edits). Atomic
// createMany avoids the concurrent-render unique-constraint race.
export async function ensurePlans(): Promise<void> {
  await prisma.plan.createMany({
    data: DEFAULT_PLANS.map((p) => ({
      id: p.id,
      name: p.name,
      priceLabel: p.priceLabel,
      priceMonthly: p.priceMonthly,
      maxEventTypes: p.maxEventTypes,
      customBranding: p.customBranding,
      teamScheduling: p.teamScheduling,
      features: p.features,
      stripePriceId: p.stripePriceId,
      active: p.active,
      sortOrder: p.sortOrder,
      isSystem: p.isSystem,
    })),
    skipDuplicates: true,
  });
}

// All plans, sorted. Request-cached. Falls back to defaults if the DB is empty
// or unreachable so pages always render.
export const getAllPlans = cache(async (): Promise<PlanConfig[]> => {
  try {
    const rows = await prisma.plan.findMany({ orderBy: { sortOrder: "asc" } });
    if (rows.length === 0) return DEFAULT_PLANS;
    return rows.map(toConfig);
  } catch {
    return DEFAULT_PLANS;
  }
});

// Only active plans, for the customer-facing billing page.
export async function getActivePlans(): Promise<PlanConfig[]> {
  return (await getAllPlans()).filter((p) => p.active);
}

export const getPlanMap = cache(async (): Promise<Map<string, PlanConfig>> => {
  const all = await getAllPlans();
  return new Map(all.map((p) => [p.id, p]));
});

// Resolve one plan's config. Unknown ids fall back to FREE so a deleted/renamed
// plan never crashes gating or rendering.
export async function getPlanConfig(id: string): Promise<PlanConfig> {
  const map = await getPlanMap();
  return (
    map.get(id) ??
    map.get("FREE") ??
    DEFAULT_PLANS[0]
  );
}

// Plan ids in display order.
export async function getPlanOrder(): Promise<string[]> {
  return (await getAllPlans()).map((p) => p.id);
}
