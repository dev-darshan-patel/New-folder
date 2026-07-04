import "server-only";
import type { Coupon } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { Plan } from "@/lib/plans";

export type CouponValidation =
  | { ok: true; coupon: Coupon }
  | { ok: false; error: string };

function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export async function validateCoupon(params: {
  code: string;
  userId: string;
  targetPlan?: Plan;
}): Promise<CouponValidation> {
  const code = normalizeCode(params.code);
  if (!code) return { ok: false, error: "Enter a promo code." };

  const coupon = await prisma.coupon.findUnique({ where: { code } });
  if (!coupon || !coupon.active) {
    return { ok: false, error: "That promo code is not valid." };
  }
  if (coupon.expiresAt && coupon.expiresAt.getTime() < Date.now()) {
    return { ok: false, error: "That promo code has expired." };
  }
  if (coupon.maxRedemptions != null && coupon.redemptionCount >= coupon.maxRedemptions) {
    return { ok: false, error: "That promo code has reached its usage limit." };
  }

  const existing = await prisma.couponRedemption.findUnique({
    where: { couponId_userId: { couponId: coupon.id, userId: params.userId } },
  });
  if (existing) {
    return { ok: false, error: "You have already used this promo code." };
  }

  if (params.targetPlan) {
    if (coupon.type === "TRIAL" && coupon.grantPlan && coupon.grantPlan !== params.targetPlan) {
      return {
        ok: false,
        error: `This code applies to the ${coupon.grantPlan} plan only.`,
      };
    }
    if (coupon.type === "STRIPE_PROMO" && coupon.grantPlan && coupon.grantPlan !== params.targetPlan) {
      return {
        ok: false,
        error: `This code applies to the ${coupon.grantPlan} plan only.`,
      };
    }
  }

  if (coupon.type === "TRIAL") {
    if (!coupon.grantPlan || coupon.grantPlan === "FREE") {
      return { ok: false, error: "This promo code is misconfigured." };
    }
    if (coupon.value < 1) {
      return { ok: false, error: "This promo code is misconfigured." };
    }
  }

  if (coupon.type === "STRIPE_PROMO" && !coupon.stripePromotionCodeId) {
    return { ok: false, error: "This promo code is not linked to Stripe yet." };
  }

  return { ok: true, coupon };
}

export async function recordCouponRedemption(couponId: string, userId: string) {
  await prisma.$transaction([
    prisma.couponRedemption.create({ data: { couponId, userId } }),
    prisma.coupon.update({
      where: { id: couponId },
      data: { redemptionCount: { increment: 1 } },
    }),
  ]);
}
