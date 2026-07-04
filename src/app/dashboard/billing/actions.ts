"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getStripe, getStripePriceForPlan } from "@/lib/stripe";
import type { Plan } from "@/lib/plans";
import { validateCoupon, recordCouponRedemption } from "@/lib/coupons";

function appUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

function billingRedirect(params: Record<string, string>): never {
  const usp = new URLSearchParams(params);
  redirect(`/dashboard/billing?${usp.toString()}`);
}

// Start a Stripe Checkout session to subscribe to a paid plan.
export async function createCheckoutAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  const plan = String(formData.get("plan") || "") as Plan;
  const couponCode = String(formData.get("couponCode") || "").trim();

  let validatedCoupon: Awaited<ReturnType<typeof validateCoupon>> = { ok: false, error: "" };
  if (couponCode) {
    validatedCoupon = await validateCoupon({
      code: couponCode,
      userId: user.id,
      targetPlan: plan,
    });
    if (!validatedCoupon.ok) {
      billingRedirect({ coupon_error: validatedCoupon.error });
    }
  }

  if (validatedCoupon.ok && validatedCoupon.coupon.type === "TRIAL") {
    const { coupon } = validatedCoupon;
    const grantPlan = coupon.grantPlan;
    if (!grantPlan || grantPlan === "FREE") {
      billingRedirect({ coupon_error: "This promo code is misconfigured." });
    }
    await prisma.user.update({
      where: { id: user.id },
      data: {
        plan: grantPlan,
        subscriptionStatus: "active",
        planRenewsAt: new Date(Date.now() + coupon.value * 86_400_000),
      },
    });
    await recordCouponRedemption(coupon.id, user.id);
    revalidatePath("/dashboard/billing");
    revalidatePath("/dashboard/event-types");
    billingRedirect({ success: "1", coupon: coupon.code });
  }

  const stripe = await getStripe();
  const priceId = await getStripePriceForPlan(plan);
  if (!stripe || !priceId) {
    redirect("/dashboard/billing?error=stripe_not_configured");
  }

  let customerId = user.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.businessName,
      metadata: { userId: user.id },
    });
    customerId = customer.id;
    await prisma.user.update({
      where: { id: user.id },
      data: { stripeCustomerId: customerId },
    });
  }

  const stripePromoId =
    validatedCoupon.ok && validatedCoupon.coupon.type === "STRIPE_PROMO"
      ? validatedCoupon.coupon.stripePromotionCodeId
      : null;

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    ...(stripePromoId ? { discounts: [{ promotion_code: stripePromoId }] } : {}),
    success_url: `${appUrl()}/dashboard/billing?success=1`,
    cancel_url: `${appUrl()}/dashboard/billing?canceled=1`,
    metadata: {
      userId: user.id,
      plan,
      ...(validatedCoupon.ok ? { couponId: validatedCoupon.coupon.id } : {}),
    },
  });

  if (validatedCoupon.ok) {
    await recordCouponRedemption(validatedCoupon.coupon.id, user.id);
  }

  if (!session.url) throw new Error("Failed to create checkout session");
  redirect(session.url);
}

// Open the Stripe billing portal to manage or cancel a subscription.
export async function createPortalAction() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  const stripe = await getStripe();
  if (!stripe || !user.stripeCustomerId) {
    redirect("/dashboard/billing");
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${appUrl()}/dashboard/billing`,
  });
  redirect(session.url);
}

// Dev-only: directly set the plan to test feature gating without Stripe.
export async function devSetPlanAction(formData: FormData) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Disabled in production");
  }
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  const plan = String(formData.get("plan") || "FREE") as Plan;

  await prisma.user.update({
    where: { id: user.id },
    data: {
      plan,
      subscriptionStatus: plan === "FREE" ? null : "active",
      planRenewsAt:
        plan === "FREE" ? null : new Date(Date.now() + 30 * 86400000),
    },
  });
  revalidatePath("/dashboard/billing");
  revalidatePath("/dashboard/event-types");
}
