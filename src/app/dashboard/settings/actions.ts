"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getImpersonator, createSession } from "@/lib/auth";
import { slugify, RESERVED_SLUGS } from "@/lib/slug";
import { sendEmail } from "@/lib/email";
import { renderTemplate } from "@/lib/email-templates";
import { disconnectGoogleCalendar } from "@/lib/google-calendar";
import { disconnectZoom } from "@/lib/zoom";
import { getDeletionImpact } from "@/lib/account-deletion";

export type SettingsState = { ok: true; message: string } | { error: string } | null;

// Remove the owner's connected Google Calendar. Event types set to Google Meet
// will fall back to no-link until a calendar is reconnected.
export async function disconnectCalendarAction() {
  const user = await getCurrentUser();
  if (!user) return;
  await disconnectGoogleCalendar(user.id);
  revalidatePath("/dashboard/settings");
}

// Remove the owner's connected Zoom account. Event types set to Zoom will
// fall back to no-link until Zoom is reconnected.
export async function disconnectZoomAction() {
  const user = await getCurrentUser();
  if (!user) return;
  await disconnectZoom(user.id);
  revalidatePath("/dashboard/settings");
}

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
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, tokenVersion: { increment: 1 } },
  });
  // Re-issue this session with the new tokenVersion so the user who just
  // changed their password isn't logged out by their own version bump.
  await createSession(user.id);

  // Security confirmation email. Never block the change on send failure.
  try {
    const mail = await renderTemplate("auth.password_changed", { user_name: user.name });
    await sendEmail({ to: user.email, ...mail });
  } catch (err) {
    console.error("Failed to send password-changed email", err);
  }

  return { ok: true, message: "Password changed." };
}

// --- Account deletion (grace-period, self-service) --------------------------

// Starts the deletion grace period. The account stays fully active — nothing
// is cancelled yet — until a cron tick past DELETION_GRACE_HOURS runs the
// actual destructive cascade (src/app/api/cron/account-deletion/route.ts).
// Identity re-check: password owners must re-type their password; OAuth-only
// owners (no passwordHash) confirm by typing their booking-page slug instead,
// mirroring the hard-delete admin confirmation pattern.
export async function requestAccountDeletionAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated." };

  // An admin impersonating this account is not the real owner — never let a
  // support session trigger deletion on someone else's behalf.
  if (await getImpersonator()) {
    return { error: "Account deletion isn't available while impersonating." };
  }

  if (user.deletionRequestedAt) {
    return { error: "Account deletion is already in progress." };
  }

  if (user.passwordHash) {
    const password = String(formData.get("password") || "");
    if (!(await bcrypt.compare(password, user.passwordHash))) {
      return { error: "Password is incorrect." };
    }
  } else {
    const slugConfirm = String(formData.get("slugConfirm") || "").trim().toLowerCase();
    if (slugConfirm !== user.slug.toLowerCase()) {
      return { error: `Type "${user.slug}" to confirm.` };
    }
  }

  // Never let the last super-admin delete themselves out of the console.
  if (user.adminRole === "SUPER_ADMIN") {
    const otherSuperAdmins = await prisma.user.count({
      where: { adminRole: "SUPER_ADMIN", id: { not: user.id }, deletedAt: null },
    });
    if (otherSuperAdmins === 0) {
      return { error: "You're the only super-admin — assign another one before deleting this account." };
    }
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { deletionRequestedAt: new Date() },
  });

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard");
  return { ok: true, message: "Account deletion scheduled." };
}

// One-click undo during the grace period — no token needed, the owner is
// still logged in and the account was never actually touched yet.
export async function cancelDeletionRequestAction(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  await prisma.user.update({
    where: { id: user.id },
    data: { deletionRequestedAt: null },
  });

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard");
}

export async function getDeletionImpactAction() {
  const user = await getCurrentUser();
  if (!user) return null;
  return getDeletionImpact(user.id);
}
