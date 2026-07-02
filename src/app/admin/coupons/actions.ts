"use server";

import { revalidatePath } from "next/cache";
import type { CouponType, Plan } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdminRole } from "@/lib/admin-auth";
import { writeAuditLog } from "@/lib/admin-audit";

const PLANS: Plan[] = ["FREE", "PRO", "BUSINESS"];
const TYPES: CouponType[] = ["TRIAL", "STRIPE_PROMO"];

function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "");
}

export async function createCouponAction(formData: FormData) {
  const admin = await requireAdminRole("SUPPORT");

  const code = normalizeCode(String(formData.get("code") || ""));
  const description = String(formData.get("description") || "").trim().slice(0, 200) || null;
  const type = String(formData.get("type") || "") as CouponType;
  const value = Math.max(0, Math.round(Number(formData.get("value") || 0)));
  const grantPlanRaw = String(formData.get("grantPlan") || "").trim();
  const grantPlan = PLANS.includes(grantPlanRaw as Plan) ? (grantPlanRaw as Plan) : null;
  const stripePromotionCodeId =
    String(formData.get("stripePromotionCodeId") || "").trim() || null;
  const maxRaw = String(formData.get("maxRedemptions") || "").trim();
  const maxRedemptions = maxRaw === "" ? null : Math.max(1, Math.round(Number(maxRaw)));
  const expiresRaw = String(formData.get("expiresAt") || "").trim();
  const expiresAt = expiresRaw ? new Date(expiresRaw) : null;

  if (!code) throw new Error("Code is required.");
  if (!TYPES.includes(type)) throw new Error("Invalid coupon type.");
  if (type === "TRIAL" && (!grantPlan || grantPlan === "FREE" || value < 1)) {
    throw new Error("Trial coupons need a paid plan and at least 1 day.");
  }
  if (type === "STRIPE_PROMO" && !stripePromotionCodeId) {
    throw new Error("Stripe promo coupons need a promotion code ID.");
  }

  const existing = await prisma.coupon.findUnique({ where: { code } });
  if (existing) throw new Error("That code already exists.");

  const coupon = await prisma.coupon.create({
    data: {
      code,
      description,
      type,
      value: type === "TRIAL" ? value : 0,
      grantPlan: grantPlan && grantPlan !== "FREE" ? grantPlan : null,
      stripePromotionCodeId,
      maxRedemptions,
      expiresAt: expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt : null,
    },
  });

  await writeAuditLog({
    actor: admin,
    action: "coupon.create",
    metadata: { code: coupon.code, type: coupon.type },
  });

  revalidatePath("/admin/coupons");
}

export async function toggleCouponAction(formData: FormData) {
  const admin = await requireAdminRole("SUPPORT");
  const id = String(formData.get("id") || "");
  const active = formData.get("active") === "true";
  if (!id) return;

  const coupon = await prisma.coupon.findUnique({ where: { id } });
  if (!coupon) return;

  await prisma.coupon.update({ where: { id }, data: { active } });
  await writeAuditLog({
    actor: admin,
    action: "coupon.toggle",
    metadata: { code: coupon.code, active },
  });

  revalidatePath("/admin/coupons");
}

export async function deleteCouponAction(formData: FormData) {
  const admin = await requireAdminRole("SUPER_ADMIN");
  const id = String(formData.get("id") || "");
  if (!id) return;

  const coupon = await prisma.coupon.findUnique({ where: { id } });
  if (!coupon) return;

  await prisma.coupon.delete({ where: { id } });
  await writeAuditLog({
    actor: admin,
    action: "coupon.delete",
    metadata: { code: coupon.code },
  });

  revalidatePath("/admin/coupons");
}
