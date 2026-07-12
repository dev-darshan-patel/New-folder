"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import type { AdminRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createSession, getImpersonator } from "@/lib/auth";
import { requireAdminRole } from "@/lib/admin-auth";
import { writeAuditLog } from "@/lib/admin-audit";
import { sendEmail } from "@/lib/email";
import { renderTemplate } from "@/lib/email-templates";
import { getPlanMap, type Plan } from "@/lib/plans";
import { uniqueUserSlug, RESERVED_SLUGS } from "@/lib/slug";
import logger from "@/lib/logger";

const ROLES: AdminRole[] = ["SUPER_ADMIN", "SUPPORT", "READ_ONLY"];

async function targetOrThrow(userId: string) {
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) throw new Error("User not found");
  return target;
}

// --- Notes (SUPPORT+) -------------------------------------------------

export async function addAdminNoteAction(formData: FormData) {
  const admin = await requireAdminRole("SUPPORT");
  const userId = String(formData.get("userId") || "");
  const body = String(formData.get("body") || "").trim();
  if (!userId || !body) return;

  await prisma.adminNote.create({
    data: { userId, body: body.slice(0, 2000), authorEmail: admin.email },
  });
  const target = await prisma.user.findUnique({ where: { id: userId } });
  await writeAuditLog({
    actor: admin,
    action: "note.add",
    targetUserId: userId,
    targetLabel: target?.businessName,
  });

  revalidatePath(`/admin/users/${userId}`);
}

// --- Plan changes (SUPPORT+) -------------------------------------------

export async function changeUserPlanAction(formData: FormData) {
  const admin = await requireAdminRole("SUPPORT");
  const userId = String(formData.get("userId") || "");
  const plan = String(formData.get("plan") || "") as Plan;
  const reason = String(formData.get("reason") || "").trim().slice(0, 500);
  if (!(await getPlanMap()).has(plan)) return;

  const target = await targetOrThrow(userId);
  await prisma.user.update({
    where: { id: userId },
    data: {
      plan,
      subscriptionStatus: plan === "FREE" ? null : "active",
      planRenewsAt: plan === "FREE" ? null : new Date(Date.now() + 30 * 86_400_000),
    },
  });
  await writeAuditLog({
    actor: admin,
    action: "user.plan_change",
    targetUserId: userId,
    targetLabel: target.businessName,
    metadata: { oldPlan: target.plan, newPlan: plan, reason: reason || undefined },
  });

  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin/users");
}

// --- Force password reset (SUPPORT+) ------------------------------------

export async function forcePasswordResetAction(formData: FormData) {
  const admin = await requireAdminRole("SUPPORT");
  const userId = String(formData.get("userId") || "");
  const target = await targetOrThrow(userId);

  const token = crypto.randomUUID();
  await prisma.user.update({
    where: { id: userId },
    data: { passwordResetToken: token, passwordResetExpiresAt: new Date(Date.now() + 3_600_000) },
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const mail = await renderTemplate("auth.password_reset", {
    user_name: target.name,
    reset_url: `${baseUrl}/reset-password/${token}`,
  });
  await sendEmail({ to: target.email, ...mail });

  await writeAuditLog({
    actor: admin,
    action: "user.force_password_reset",
    targetUserId: userId,
    targetLabel: target.businessName,
  });

  revalidatePath(`/admin/users/${userId}`);
}

// --- Suspend / unsuspend (SUPPORT+) -------------------------------------

export async function setSuspendedAction(formData: FormData) {
  const admin = await requireAdminRole("SUPPORT");
  const userId = String(formData.get("userId") || "");
  const suspended = formData.get("suspended") === "1";
  const target = await targetOrThrow(userId);

  await prisma.user.update({ where: { id: userId }, data: { suspended } });

  // Notify the account owner. Never let a send failure block the action.
  try {
    const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const mail = suspended
      ? await renderTemplate("account.suspended", { user_name: target.name })
      : await renderTemplate("account.restored", {
          user_name: target.name,
          login_url: `${base}/dashboard`,
        });
    await sendEmail({ to: target.email, ...mail });
  } catch (err) {
    logger.error({ err, userId: target.id }, "Failed to send suspend/restore email");
  }

  await writeAuditLog({
    actor: admin,
    action: suspended ? "user.suspend" : "user.unsuspend",
    targetUserId: userId,
    targetLabel: target.businessName,
  });

  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin/users");
}

// --- Soft delete / restore (SUPER_ADMIN) --------------------------------

export async function softDeleteUserAction(formData: FormData) {
  const admin = await requireAdminRole("SUPER_ADMIN");
  const userId = String(formData.get("userId") || "");
  const target = await targetOrThrow(userId);

  await prisma.user.update({ where: { id: userId }, data: { deletedAt: new Date() } });
  await writeAuditLog({
    actor: admin,
    action: "user.soft_delete",
    targetUserId: userId,
    targetLabel: target.businessName,
  });

  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin/users");
}

export async function restoreUserAction(formData: FormData) {
  const admin = await requireAdminRole("SUPER_ADMIN");
  const userId = String(formData.get("userId") || "");
  const target = await targetOrThrow(userId);

  await prisma.user.update({ where: { id: userId }, data: { deletedAt: null } });
  await writeAuditLog({
    actor: admin,
    action: "user.restore",
    targetUserId: userId,
    targetLabel: target.businessName,
  });

  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin/users");
}

// --- Hard delete (SUPER_ADMIN, requires typed confirmation) -------------

export async function hardDeleteUserAction(formData: FormData) {
  const admin = await requireAdminRole("SUPER_ADMIN");
  const userId = String(formData.get("userId") || "");
  const confirmSlug = String(formData.get("confirmSlug") || "").trim();
  const target = await targetOrThrow(userId);

  if (confirmSlug !== target.slug) {
    throw new Error("Confirmation text did not match — account not deleted.");
  }

  await writeAuditLog({
    actor: admin,
    action: "user.hard_delete",
    targetUserId: userId,
    targetLabel: target.businessName,
    metadata: { email: target.email, slug: target.slug },
  });
  // Cascades to EventType/Availability/Booking/AdminNote via onDelete: Cascade.
  await prisma.user.delete({ where: { id: userId } });

  redirect("/admin/users");
}

// --- Impersonation (SUPER_ADMIN) ----------------------------------------

export async function startImpersonationAction(formData: FormData) {
  const admin = await requireAdminRole("SUPER_ADMIN");
  const userId = String(formData.get("userId") || "");
  const target = await targetOrThrow(userId);
  if (target.suspended || target.deletedAt) {
    throw new Error("Cannot impersonate a suspended or deleted account.");
  }

  await createSession(userId, { impersonatedBy: admin.id });
  await writeAuditLog({
    actor: admin,
    action: "user.impersonate_start",
    targetUserId: userId,
    targetLabel: target.businessName,
  });

  redirect("/dashboard");
}

export async function stopImpersonationAction() {
  const admin = await getImpersonator();
  if (!admin) redirect("/dashboard");

  await createSession(admin.id);
  await writeAuditLog({ actor: admin, action: "user.impersonate_stop" });

  redirect("/admin/users");
}

// --- Admin role management (SUPER_ADMIN) --------------------------------

export async function setAdminRoleAction(formData: FormData) {
  const admin = await requireAdminRole("SUPER_ADMIN");
  const userId = String(formData.get("userId") || "");
  const roleRaw = String(formData.get("role") || "");
  const role = ROLES.includes(roleRaw as AdminRole) ? (roleRaw as AdminRole) : null;
  const target = await targetOrThrow(userId);

  await prisma.user.update({ where: { id: userId }, data: { adminRole: role } });
  await writeAuditLog({
    actor: admin,
    action: "user.set_admin_role",
    targetUserId: userId,
    targetLabel: target.businessName,
    metadata: { oldRole: target.adminRole, newRole: role },
  });

  revalidatePath(`/admin/users/${userId}`);
}

// --- Create / edit users (SUPER_ADMIN) ----------------------------------

export type AdminUserFormState =
  | { ok: true; message: string; userId?: string }
  | { error: string }
  | null;

export async function createUserByAdminAction(
  _prev: AdminUserFormState,
  formData: FormData,
): Promise<AdminUserFormState> {
  const admin = await requireAdminRole("SUPER_ADMIN");

  const name = String(formData.get("name") || "").trim();
  const businessName = String(formData.get("businessName") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const timezone = String(formData.get("timezone") || "UTC") || "UTC";
  const mobile = String(formData.get("mobile") || "").trim() || null;
  const planRaw = String(formData.get("plan") || "FREE");
  const adminRoleRaw = String(formData.get("adminRole") || "");
  const adminRole: AdminRole | null = ROLES.includes(adminRoleRaw as AdminRole)
    ? (adminRoleRaw as AdminRole)
    : null;

  if (!name || !businessName || !email || !password) {
    return { error: "Name, business name, email, and password are required." };
  }
  if (password.length < 8) return { error: "Password must be at least 8 characters." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Enter a valid email." };
  if (!(await getPlanMap()).has(planRaw)) return { error: "Invalid plan." };
  const plan = planRaw as Plan;

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) return { error: "An account with that email already exists." };

  const passwordHash = await bcrypt.hash(password, 10);
  const slug = await uniqueUserSlug(businessName);

  const user = await prisma.user.create({
    data: {
      name,
      businessName,
      email,
      passwordHash,
      slug,
      timezone,
      mobile,
      plan,
      adminRole,
      eventTypes: {
        create: {
          title: "30 Minute Meeting",
          slug: "30-min",
          durationMinutes: 30,
          description: "A quick 30 minute call.",
        },
      },
      availability: {
        create: [1, 2, 3, 4, 5].map((weekday) => ({
          weekday,
          startMinutes: 9 * 60,
          endMinutes: 17 * 60,
        })),
      },
    },
    select: { id: true, email: true, businessName: true },
  });

  await writeAuditLog({
    actor: admin,
    action: "user.create",
    targetUserId: user.id,
    targetLabel: user.businessName,
    metadata: {
      email: user.email,
      plan,
      adminRole: adminRole ?? "none",
      mobileProvided: Boolean(mobile),
    },
  });

  revalidatePath("/admin/users");
  return { ok: true, message: "User created.", userId: user.id };
}

export async function updateUserByAdminAction(
  _prev: AdminUserFormState,
  formData: FormData,
): Promise<AdminUserFormState> {
  const admin = await requireAdminRole("SUPER_ADMIN");
  const id = String(formData.get("id") || "");
  if (!id) return { error: "Missing user id." };

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return { error: "User not found." };

  const name = String(formData.get("name") || "").trim();
  const businessName = String(formData.get("businessName") || "").trim();
  const emailRaw = String(formData.get("email") || "").trim().toLowerCase();
  const slugRaw = String(formData.get("slug") || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const timezone = String(formData.get("timezone") || "").trim() || target.timezone;
  const mobile = String(formData.get("mobile") || "").trim() || null;

  if (!name || !businessName || !emailRaw || !slugRaw) {
    return { error: "Name, business name, email, and slug are required." };
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailRaw)) return { error: "Enter a valid email." };
  if (RESERVED_SLUGS.has(slugRaw)) return { error: "That slug is reserved." };

  const emailClash = await prisma.user.findFirst({
    where: { email: emailRaw, id: { not: id } },
    select: { id: true },
  });
  if (emailClash) return { error: "Another account already uses that email." };
  const slugClash = await prisma.user.findFirst({
    where: { slug: slugRaw, id: { not: id } },
    select: { id: true },
  });
  if (slugClash) return { error: "Another account already uses that URL slug." };

  const changed: Record<string, unknown> = {};
  if (target.name !== name) changed.name = { from: target.name, to: name };
  if (target.businessName !== businessName)
    changed.businessName = { from: target.businessName, to: businessName };
  if (target.email !== emailRaw) changed.email = { from: target.email, to: emailRaw };
  if (target.slug !== slugRaw) changed.slug = { from: target.slug, to: slugRaw };
  if (target.timezone !== timezone) changed.timezone = { from: target.timezone, to: timezone };
  if ((target.mobile ?? null) !== mobile) changed.mobile = "changed";

  await prisma.user.update({
    where: { id },
    data: { name, businessName, email: emailRaw, slug: slugRaw, timezone, mobile },
  });

  await writeAuditLog({
    actor: admin,
    action: "user.update",
    targetUserId: id,
    targetLabel: businessName,
    metadata: { changed },
  });

  revalidatePath(`/admin/users/${id}`);
  revalidatePath("/admin/users");
  return { ok: true, message: "User updated." };
}
