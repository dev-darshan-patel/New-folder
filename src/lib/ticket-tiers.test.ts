import { describe, it, expect } from "vitest";
import { tierRemaining, validateTierSelection, type TierInfo } from "@/lib/ticket-tiers";

const vip: TierInfo = { id: "t-vip", name: "VIP", capacity: 10, seatsTaken: 8 };
const soldOut: TierInfo = { id: "t-sold", name: "Front Row", capacity: 5, seatsTaken: 5 };
const general: TierInfo = { id: "t-gen", name: "General", capacity: null, seatsTaken: 500 };

describe("tierRemaining", () => {
  it("returns capacity minus seatsTaken for a capped tier", () => {
    expect(tierRemaining(vip)).toBe(2);
  });
  it("floors at zero rather than going negative", () => {
    // Guards against a display bug if seatsTaken ever exceeds capacity due to
    // a race the atomic claim should already prevent — defence in depth.
    expect(tierRemaining({ id: "x", name: "X", capacity: 5, seatsTaken: 7 })).toBe(0);
  });
  it("returns null (unlimited) for a null-capacity tier regardless of seatsTaken", () => {
    expect(tierRemaining(general)).toBeNull();
  });
});

describe("validateTierSelection", () => {
  const tiers = [vip, soldOut, general];

  it("rejects when no tierId is given", () => {
    const r = validateTierSelection(tiers, undefined, 6);
    expect(r.ok).toBe(false);
  });

  it("rejects an unknown tierId", () => {
    const r = validateTierSelection(tiers, "does-not-exist", 6);
    expect(r.ok).toBe(false);
  });

  it("rejects a sold-out tier by name", () => {
    const r = validateTierSelection(tiers, "t-sold", 6);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("Front Row");
  });

  it("caps maxQty at the tier's remaining seats when below the order cap", () => {
    const r = validateTierSelection(tiers, "t-vip", 6);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.maxQty).toBe(2); // remaining=2 < maxPerOrder=6
  });

  it("caps maxQty at the order limit when the tier has more room than that", () => {
    const r = validateTierSelection(tiers, "t-vip", 1);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.maxQty).toBe(1); // maxPerOrder=1 < remaining=2
  });

  it("an unlimited tier is bounded only by maxPerOrder", () => {
    const r = validateTierSelection(tiers, "t-gen", 6);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.maxQty).toBe(6);
  });
});
