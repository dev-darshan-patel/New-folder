import type { Plan } from "@prisma/client";

export type PlanConfig = {
  id: Plan;
  name: string;
  // Display price; billing is monthly. 0 = free.
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
};

export const PLANS: Record<Plan, PlanConfig> = {
  FREE: {
    id: "FREE",
    name: "Free",
    priceLabel: "$0",
    priceMonthly: 0,
    maxEventTypes: 1,
    customBranding: false,
    teamScheduling: false,
    features: ["1 event type", "Unlimited bookings", "Email confirmations"],
  },
  PRO: {
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
  },
  BUSINESS: {
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
  },
};

export const PLAN_ORDER: Plan[] = ["FREE", "PRO", "BUSINESS"];

export function planConfig(plan: Plan): PlanConfig {
  return PLANS[plan];
}
