import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { isFeatureKey, type FeatureKey } from "@/lib/features";

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
  // Which FeatureKey entries (src/lib/features.ts) this plan grants. The
  // admin-editable source of truth for every gate in the app.
  featureKeys: string[];
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
    featureKeys: ["custom_branding", "embed_widget"],
    features: [
      "1 event type",
      "Unlimited bookings",
      "Email confirmations",
      "Custom booking-page branding",
      "Embeddable booking widget",
    ],
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
    featureKeys: [
      "custom_branding",
      "embed_widget",
      "intake_questions",
      "scheduling_limits",
      "video_links",
      "guest_invites",
      "approval_flow",
      "redirect_replyto",
      "csv_export",
      "manual_bookings",
    ],
    features: [
      "Up to 10 event types",
      "Everything in Free",
      "Custom intake questions",
      "Scheduling limits & notice windows",
      "Auto Google Meet / Zoom links",
      "Guest invites",
      "Manual approval",
      "Custom redirect & reply-to",
      "CSV export",
      "Manual bookings",
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
    featureKeys: [
      "custom_branding",
      "embed_widget",
      "intake_questions",
      "scheduling_limits",
      "video_links",
      "guest_invites",
      "approval_flow",
      "redirect_replyto",
      "csv_export",
      "manual_bookings",
      "team_scheduling",
      "payments",
      "group_bookings",
      "recurring_bookings",
      "calendar_busy_sync",
    ],
    features: [
      "Unlimited event types",
      "Everything in Pro",
      "Team scheduling (round-robin & collective)",
      "Accept payments",
      "Group sessions",
      "Recurring bookings",
      "Calendar busy-sync",
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
  featureKeys: string[];
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
      featureKeys: p.featureKeys,
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

// The single entry point every feature gate in the app should call. Reads
// the admin-editable featureKeys list — never the deprecated boolean columns
// directly. Unknown plan ids fall back to FREE's entitlements via
// getPlanConfig(), so a deleted/renamed plan degrades safely rather than
// granting everything.
export async function planHasFeature(planId: string, key: FeatureKey): Promise<boolean> {
  if (!isFeatureKey(key)) return false;
  const cfg = await getPlanConfig(planId);
  return cfg.featureKeys.includes(key);
}
