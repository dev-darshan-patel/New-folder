// Pure logic for ticket-tier selection — no DB import, so it's unit-testable
// without a database. The atomic per-tier claim in createGroupBookingAction
// is the actual enforcement; this function exists to fail fast with a good
// error message before spending a DB round trip, and to keep that decision
// logic out of the 200-line action so it's independently testable.

export type TierInfo = {
  id: string;
  name: string;
  capacity: number | null;
  seatsTaken: number;
};

// null = unlimited (mirrors Session.unlimited one level down).
export function tierRemaining(tier: TierInfo): number | null {
  if (tier.capacity == null) return null;
  return Math.max(0, tier.capacity - tier.seatsTaken);
}

export type TierSelectionResult =
  | { ok: true; tier: TierInfo; maxQty: number }
  | { ok: false; error: string };

// `tiers` is the full list configured on the session (possibly empty — most
// ticketed sessions have none, and this function is only called when it's
// non-empty; callers branch on `tiers.length > 0` before reaching here).
export function validateTierSelection(
  tiers: TierInfo[],
  tierId: string | undefined,
  maxPerOrder: number,
): TierSelectionResult {
  if (!tierId) return { ok: false, error: "Please choose a ticket type." };
  const tier = tiers.find((t) => t.id === tierId);
  if (!tier) return { ok: false, error: "That ticket type is no longer available." };

  const remaining = tierRemaining(tier);
  if (remaining != null && remaining <= 0) {
    return { ok: false, error: `${tier.name} is sold out.` };
  }

  const maxQty = remaining == null ? maxPerOrder : Math.min(maxPerOrder, remaining);
  return { ok: true, tier, maxQty };
}
