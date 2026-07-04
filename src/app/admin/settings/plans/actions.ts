"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminRole } from "@/lib/admin-auth";
import { writeAuditLog } from "@/lib/admin-audit";

export type PlanFormState = { ok: true; message: string } | { error: string } | null;

// Parse the shared plan fields from a submitted form.
function parsePlanFields(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const priceLabel = String(formData.get("priceLabel") || "").trim();
  const priceMonthly = Math.max(0, Math.round(Number(formData.get("priceMonthly") || 0)));
  const maxRaw = String(formData.get("maxEventTypes") || "").trim();
  const maxEventTypes = maxRaw === "" ? null : Math.max(0, Math.round(Number(maxRaw)));
  const customBranding = formData.get("customBranding") === "on";
  const teamScheduling = formData.get("teamScheduling") === "on";
  const features = String(formData.get("features") || "")
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean);
  const stripePriceId = String(formData.get("stripePriceId") || "").trim() || null;
  const active = formData.get("active") === "on";
  const sortOrder = Math.round(Number(formData.get("sortOrder") || 0));
  return {
    name,
    priceLabel,
    priceMonthly,
    maxEventTypes,
    customBranding,
    teamScheduling,
    features,
    stripePriceId,
    active,
    sortOrder,
  };
}

export async function createPlanAction(
  _prev: PlanFormState,
  formData: FormData,
): Promise<PlanFormState> {
  const admin = await requireAdminRole("SUPER_ADMIN");

  const id = String(formData.get("id") || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "_");
  if (!id) return { error: "Plan ID is required (e.g. STARTER)." };

  const fields = parsePlanFields(formData);
  if (!fields.name) return { error: "Name is required." };
  if (!fields.priceLabel) return { error: "Price label is required (e.g. $19/mo)." };

  const existing = await prisma.plan.findUnique({ where: { id }, select: { id: true } });
  if (existing) return { error: `A plan with ID "${id}" already exists.` };

  await prisma.plan.create({ data: { id, ...fields, isSystem: false } });
  await writeAuditLog({ actor: admin, action: "settings.plan_create", metadata: { id } });

  revalidatePath("/admin/settings/plans");
  return { ok: true, message: `Plan "${id}" created.` };
}

export async function updatePlanAction(
  _prev: PlanFormState,
  formData: FormData,
): Promise<PlanFormState> {
  const admin = await requireAdminRole("SUPER_ADMIN");
  const id = String(formData.get("id") || "").trim();
  if (!id) return { error: "Missing plan ID." };

  const existing = await prisma.plan.findUnique({ where: { id } });
  if (!existing) return { error: "Plan not found." };

  const fields = parsePlanFields(formData);
  if (!fields.name) return { error: "Name is required." };
  if (!fields.priceLabel) return { error: "Price label is required." };
  // The FREE system plan must stay free and active so gating still works.
  if (existing.isSystem) {
    fields.priceMonthly = 0;
    fields.active = true;
  }

  await prisma.plan.update({ where: { id }, data: fields });
  await writeAuditLog({ actor: admin, action: "settings.plan_update", metadata: { id } });

  revalidatePath("/admin/settings/plans");
  revalidatePath(`/admin/settings/plans/${id}`);
  return { ok: true, message: "Plan saved." };
}

export async function togglePlanActiveAction(formData: FormData) {
  const admin = await requireAdminRole("SUPER_ADMIN");
  const id = String(formData.get("id") || "").trim();
  const active = formData.get("active") === "true";
  const plan = await prisma.plan.findUnique({ where: { id } });
  if (!plan || plan.isSystem) return; // FREE stays active

  await prisma.plan.update({ where: { id }, data: { active } });
  await writeAuditLog({ actor: admin, action: "settings.plan_toggle", metadata: { id, active } });
  revalidatePath("/admin/settings/plans");
}

export async function deletePlanAction(formData: FormData) {
  const admin = await requireAdminRole("SUPER_ADMIN");
  const id = String(formData.get("id") || "").trim();

  const plan = await prisma.plan.findUnique({ where: { id } });
  if (!plan) return;
  if (plan.isSystem) {
    throw new Error("The FREE system plan can't be deleted.");
  }

  // Block deletion while any account is still on this plan.
  const inUse = await prisma.user.count({ where: { plan: id } });
  if (inUse > 0) {
    throw new Error(
      `${inUse} account${inUse === 1 ? "" : "s"} are on this plan. Move them off it first.`,
    );
  }

  await prisma.plan.delete({ where: { id } });
  await writeAuditLog({ actor: admin, action: "settings.plan_delete", metadata: { id } });
  revalidatePath("/admin/settings/plans");
}
