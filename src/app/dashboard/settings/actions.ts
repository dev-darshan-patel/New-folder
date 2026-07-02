"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { slugify } from "@/lib/slug";

export type SettingsState = { ok: true; message: string } | { error: string } | null;

// Reserved words that collide with static routes — must not be used as slugs.
const RESERVED_SLUGS = new Set([
  "dashboard",
  "login",
  "signup",
  "admin",
  "api",
  "booking",
  "reset-password",
  "forgot-password",
]);

export async function updateProfileAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated." };

  const name = String(formData.get("name") || "").trim();
  const businessName = String(formData.get("businessName") || "").trim();
  const mobile = String(formData.get("mobile") || "").trim();
  const timezone = String(formData.get("timezone") || "").trim() || "UTC";
  const rawSlug = String(formData.get("slug") || "").trim();
  const slug = slugify(rawSlug);

  if (!name || !businessName) return { error: "Name and business name are required." };
  if (!slug) return { error: "Booking URL handle is required." };
  if (RESERVED_SLUGS.has(slug)) return { error: "That URL handle is reserved. Pick another." };

  // Slug must be unique across tenants (excluding self).
  const clash = await prisma.user.findFirst({
    where: { slug, id: { not: user.id } },
    select: { id: true },
  });
  if (clash) return { error: "That booking URL is already taken. Pick another." };

  await prisma.user.update({
    where: { id: user.id },
    data: { name, businessName, mobile: mobile || null, timezone, slug },
  });

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard");
  return { ok: true, message: "Profile updated." };
}

export async function changePasswordAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated." };

  const current = String(formData.get("currentPassword") || "");
  const next = String(formData.get("newPassword") || "");
  const confirm = String(formData.get("confirmPassword") || "");

  if (next.length < 8) return { error: "New password must be at least 8 characters." };
  if (next !== confirm) return { error: "New passwords do not match." };

  // getCurrentUser() returns the full User record, so passwordHash is available.
  if (!user.passwordHash) {
    return {
      error: "This account signs in with Google or Microsoft and has no password to change.",
    };
  }
  if (!(await bcrypt.compare(current, user.passwordHash))) {
    return { error: "Current password is incorrect." };
  }

  const passwordHash = await bcrypt.hash(next, 10);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

  return { ok: true, message: "Password changed." };
}
