"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getImpersonator, createSession } from "@/lib/auth";
import { slugify, RESERVED_SLUGS } from "@/lib/slug";
import { sendEmail } from "@/lib/email";
import { renderTemplate } from "@/lib/email-templates";
import { disconnectGoogleCalendar, setBusySync } from "@/lib/google-calendar";
import { disconnectZoom } from "@/lib/zoom";
import { getDeletionImpact } from "@/lib/account-deletion";
import {
  PAYMENT_ACCOUNT_STATUS,
  PAYMENT_APPLICATION_STATUS,
  SUPPORTED_COUNTRIES,
  tenantEligibleProviders,
  canSwitchPaymentProvider,
} from "@/lib/payments";
import { planHasFeature } from "@/lib/plans";
import type { PaymentProvider } from "@/lib/payments/provider";
import logger from "@/lib/logger";

export type SettingsState = { ok: true; message: string } | { error: string } | null;

// Remove the owner's connected Google Calendar. Event types set to Google Meet
// will fall back to no-link until a calendar is reconnected.
export async function disconnectCalendarAction() {
  const user = await getCurrentUser();
  if (!user) return;
  await disconnectGoogleCalendar(user.id);
  revalidatePath("/dashboard/settings");
}

// Toggle whether busy times from the owner's connected Google Calendar hide
// slots on the public booking page.
export async function toggleBusySyncAction(enabled: boolean) {
  const user = await getCurrentUser();
  if (!user) return;
  await setBusySync(user.id, enabled);
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
    logger.error({ err, userId: user.id }, "Failed to send password-changed email");
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

// Tenant submits a request to accept payments from their customers. This is
// the "application" step — a SUPER_ADMIN approves before any Stripe/Razorpay
// onboarding happens (Feature 4 fraud protection). Plan-gated to BUSINESS.
export async function applyForPaymentsAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated." };

  if (!(await planHasFeature(user.plan, "payments"))) {
    return { error: "Accepting payments isn't available on your current plan." };
  }
  // A tenant with an active application or an approved account has nothing
  // to apply for. SUSPENDED tenants can re-apply (admin decides).
  if (
    user.paymentAccountStatus === PAYMENT_ACCOUNT_STATUS.APPLIED ||
    user.paymentAccountStatus === PAYMENT_ACCOUNT_STATUS.APPROVED
  ) {
    return { error: "You already have an application in progress or an approved account." };
  }

  const country = String(formData.get("country") || "").trim().toUpperCase();
  const businessDescription = String(formData.get("businessDescription") || "").trim();
  const expectedPriceRange = String(formData.get("expectedPriceRange") || "").trim();
  const agreed = formData.get("agree") === "on";

  if (!SUPPORTED_COUNTRIES.some((c) => c.code === country)) {
    return { error: "Please select a supported country." };
  }
  if (businessDescription.length < 20) {
    return { error: "Please describe your business in at least 20 characters." };
  }
  if (businessDescription.length > 1000) {
    return { error: "Business description must be under 1000 characters." };
  }
  if (!expectedPriceRange || expectedPriceRange.length > 200) {
    return { error: "Please enter your typical price range." };
  }
  if (!agreed) {
    return { error: "You must agree to the payments terms before applying." };
  }

  await prisma.$transaction([
    prisma.paymentApplication.create({
      data: {
        userId: user.id,
        country,
        businessDescription,
        expectedPriceRange,
        status: PAYMENT_APPLICATION_STATUS.PENDING,
      },
    }),
    prisma.user.update({
      where: { id: user.id },
      data: {
        country,
        paymentAccountStatus: PAYMENT_ACCOUNT_STATUS.APPLIED,
      },
    }),
  ]);

  // Notify platform super-admins so applications don't rot in the queue.
  // Same graceful-degrade pattern used everywhere else — a send failure
  // never blocks the user's action.
  try {
    const superAdmins = await prisma.user.findMany({
      where: { adminRole: "SUPER_ADMIN" },
      select: { email: true },
    });
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    for (const admin of superAdmins) {
      await sendEmail({
        to: admin.email,
        subject: `New payments application from ${user.businessName}`,
        text: `${user.businessName} (${user.email}) has applied to accept payments.\n\nCountry: ${country}\n\nReview: ${baseUrl}/admin/payments`,
      });
    }
  } catch (err) {
    logger.error({ err, userId: user.id }, "Failed to notify admins of new payment application");
  }

  revalidatePath("/dashboard/settings");
  return { ok: true, message: "Application submitted. We'll email you once it's reviewed." };
}

// Pick the active payment provider once approved. Only meaningful when the
// tenant is eligible for more than one (India + stripeForIndiaEnabled). The
// switch is gated on "no money in flight" so an in-progress checkout is never
// stranded on the wrong provider.
export async function setActivePaymentProviderAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated." };
  if (user.paymentAccountStatus !== PAYMENT_ACCOUNT_STATUS.APPROVED) {
    return { error: "You need to be approved before you can pick a provider." };
  }

  const provider = String(formData.get("provider") || "").toUpperCase();
  if (provider !== "STRIPE" && provider !== "RAZORPAY") {
    return { error: "Unknown provider." };
  }

  const eligible = await tenantEligibleProviders(user.country);
  if (!eligible.includes(provider as PaymentProvider)) {
    return { error: "Your country isn't eligible for that provider." };
  }
  if (user.activePaymentProvider === provider) {
    return { ok: true, message: "That provider is already active." };
  }

  const switchGate = await canSwitchPaymentProvider(user.id);
  if (!switchGate.ok) return { error: switchGate.reason };

  await prisma.user.update({
    where: { id: user.id },
    data: { activePaymentProvider: provider },
  });

  revalidatePath("/dashboard/settings");
  return { ok: true, message: "Active payment provider updated." };
}

// Manually poll the provider for the tenant's onboarding status. Called from
// the "Refresh status" button — useful when the webhook is late or when the
// tenant returned via a different tab and never hit the return route.
export async function refreshPaymentOnboardingAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated." };

  const provider = String(formData.get("provider") || "").toUpperCase();
  if (provider !== "STRIPE" && provider !== "RAZORPAY") {
    return { error: "Unknown provider." };
  }

  const accountId =
    provider === "STRIPE" ? user.stripeConnectAccountId : user.razorpayLinkedAccountId;
  if (!accountId) {
    return { error: "You haven't started onboarding for this provider yet." };
  }

  try {
    const { getPaymentAdapter } = await import("@/lib/payments/registry");
    const adapter = getPaymentAdapter(provider as PaymentProvider);
    const status = await adapter.getOnboardingStatus(accountId);
    await prisma.user.update({
      where: { id: user.id },
      data:
        provider === "STRIPE"
          ? { stripeConnectReady: status.ready }
          : { razorpayConnectReady: status.ready },
    });
    revalidatePath("/dashboard/settings");
    return {
      ok: true,
      message: status.ready
        ? "You're ready to accept payments."
        : `Still pending${status.reason ? ` — ${status.reason}` : ""}.`,
    };
  } catch (err) {
    logger.error({ err, userId: user.id, provider }, "Payments onboarding refresh failed");
    return { error: "Couldn't reach the provider. Try again in a moment." };
  }
}
