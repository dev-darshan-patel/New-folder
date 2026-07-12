"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminRole } from "@/lib/admin-auth";
import { writeAuditLog } from "@/lib/admin-audit";
import { sendEmail } from "@/lib/email";
import { SETTINGS_ID } from "@/lib/settings";
import {
  PAYMENT_ACCOUNT_STATUS,
  PAYMENT_APPLICATION_STATUS,
} from "@/lib/payments";
import { refundBookingPayment } from "@/lib/payments/refunds";
import logger from "@/lib/logger";

export type AdminPaymentsState = { ok: true; message: string } | { error: string } | null;

async function loadApplication(id: string) {
  const app = await prisma.paymentApplication.findUnique({
    where: { id },
    include: { user: true },
  });
  if (!app) throw new Error("Application not found");
  return app;
}

// Approve a pending application. Only meaningful when the tenant is still in
// APPLIED state — protects against race with a concurrent rejection or a
// stale UI. All admin mutations here require SUPER_ADMIN.
export async function approvePaymentApplicationAction(
  _prev: AdminPaymentsState,
  formData: FormData,
): Promise<AdminPaymentsState> {
  const admin = await requireAdminRole("SUPER_ADMIN");
  const id = String(formData.get("id") || "");
  if (!id) return { error: "Missing application id." };

  const app = await loadApplication(id);
  if (app.status !== PAYMENT_APPLICATION_STATUS.PENDING) {
    return { error: "This application has already been decided." };
  }

  await prisma.$transaction([
    prisma.paymentApplication.update({
      where: { id: app.id },
      data: {
        status: PAYMENT_APPLICATION_STATUS.APPROVED,
        reviewedByEmail: admin.email,
        reviewedAt: new Date(),
      },
    }),
    prisma.user.update({
      where: { id: app.userId },
      data: { paymentAccountStatus: PAYMENT_ACCOUNT_STATUS.APPROVED },
    }),
  ]);

  await writeAuditLog({
    actor: admin,
    action: "payments.approve",
    targetUserId: app.userId,
    targetLabel: app.user.businessName,
    metadata: { applicationId: app.id, country: app.country },
  });

  try {
    await sendEmail({
      to: app.user.email,
      subject: "Your payments application has been approved",
      text: `Hi ${app.user.name},\n\nYou're approved to accept payments from your customers. Head to your dashboard to finish setup with our payment provider.\n\n— The team`,
    });
  } catch (err) {
    logger.error({ err, userId: app.userId }, "Failed to send payments-approval email");
  }

  revalidatePath("/admin/payments");
  revalidatePath(`/admin/users/${app.userId}`);
  return { ok: true, message: "Application approved." };
}

// Reject a pending application. Reason is required and shown to the tenant so
// they know what to fix before re-applying.
export async function rejectPaymentApplicationAction(
  _prev: AdminPaymentsState,
  formData: FormData,
): Promise<AdminPaymentsState> {
  const admin = await requireAdminRole("SUPER_ADMIN");
  const id = String(formData.get("id") || "");
  const reason = String(formData.get("reason") || "").trim();
  if (!id) return { error: "Missing application id." };
  if (reason.length < 5) return { error: "Please give a reason (at least 5 characters)." };
  if (reason.length > 1000) return { error: "Reason must be under 1000 characters." };

  const app = await loadApplication(id);
  if (app.status !== PAYMENT_APPLICATION_STATUS.PENDING) {
    return { error: "This application has already been decided." };
  }

  await prisma.$transaction([
    prisma.paymentApplication.update({
      where: { id: app.id },
      data: {
        status: PAYMENT_APPLICATION_STATUS.REJECTED,
        reviewedByEmail: admin.email,
        reviewedAt: new Date(),
        rejectionReason: reason,
      },
    }),
    // Tenant goes back to NONE so they can re-apply after fixing the issue.
    prisma.user.update({
      where: { id: app.userId },
      data: { paymentAccountStatus: PAYMENT_ACCOUNT_STATUS.NONE },
    }),
  ]);

  await writeAuditLog({
    actor: admin,
    action: "payments.reject",
    targetUserId: app.userId,
    targetLabel: app.user.businessName,
    metadata: { applicationId: app.id, reason },
  });

  try {
    await sendEmail({
      to: app.user.email,
      subject: "Your payments application needs changes",
      text: `Hi ${app.user.name},\n\nWe reviewed your application to accept payments and it wasn't approved yet.\n\nReason: ${reason}\n\nYou can re-apply from your dashboard once the issue is resolved.\n\n— The team`,
    });
  } catch (err) {
    logger.error({ err, userId: app.userId }, "Failed to send payments-rejection email");
  }

  revalidatePath("/admin/payments");
  revalidatePath(`/admin/users/${app.userId}`);
  return { ok: true, message: "Application rejected." };
}

// Suspend an already-approved tenant. Blocks new paid bookings without
// touching historical data. Reversible via unsuspend below.
export async function suspendPaymentsAction(
  _prev: AdminPaymentsState,
  formData: FormData,
): Promise<AdminPaymentsState> {
  const admin = await requireAdminRole("SUPER_ADMIN");
  const userId = String(formData.get("userId") || "");
  const reason = String(formData.get("reason") || "").trim();
  if (!userId) return { error: "Missing user id." };
  if (reason.length < 5) return { error: "Please give a reason." };

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return { error: "User not found." };
  if (target.paymentAccountStatus !== PAYMENT_ACCOUNT_STATUS.APPROVED) {
    return { error: "This tenant isn't currently approved for payments." };
  }

  await prisma.user.update({
    where: { id: userId },
    data: { paymentAccountStatus: PAYMENT_ACCOUNT_STATUS.SUSPENDED },
  });

  await writeAuditLog({
    actor: admin,
    action: "payments.suspend",
    targetUserId: userId,
    targetLabel: target.businessName,
    metadata: { reason },
  });

  revalidatePath("/admin/payments");
  revalidatePath(`/admin/users/${userId}`);
  return { ok: true, message: "Payments suspended for this tenant." };
}

export async function unsuspendPaymentsAction(
  _prev: AdminPaymentsState,
  formData: FormData,
): Promise<AdminPaymentsState> {
  const admin = await requireAdminRole("SUPER_ADMIN");
  const userId = String(formData.get("userId") || "");
  if (!userId) return { error: "Missing user id." };

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return { error: "User not found." };
  if (target.paymentAccountStatus !== PAYMENT_ACCOUNT_STATUS.SUSPENDED) {
    return { error: "This tenant isn't currently suspended." };
  }

  await prisma.user.update({
    where: { id: userId },
    data: { paymentAccountStatus: PAYMENT_ACCOUNT_STATUS.APPROVED },
  });

  await writeAuditLog({
    actor: admin,
    action: "payments.unsuspend",
    targetUserId: userId,
    targetLabel: target.businessName,
  });

  revalidatePath("/admin/payments");
  revalidatePath(`/admin/users/${userId}`);
  return { ok: true, message: "Payments re-enabled for this tenant." };
}

// Admin knobs for the platform-wide payments config: the Stripe-for-India
// override and the platform fee. These change the eligibility matrix + the
// release-cron math respectively; both audit-logged so accidental fee spikes
// are traceable.
export async function updatePaymentsPlatformConfigAction(
  _prev: AdminPaymentsState,
  formData: FormData,
): Promise<AdminPaymentsState> {
  const admin = await requireAdminRole("SUPER_ADMIN");

  const stripeForIndiaEnabled = formData.get("stripeForIndiaEnabled") === "on";
  const feeRaw = String(formData.get("paymentFeePercent") || "0");
  const paymentFeePercent = Number(feeRaw);
  if (!Number.isFinite(paymentFeePercent) || paymentFeePercent < 0 || paymentFeePercent > 30) {
    return { error: "Platform fee must be between 0 and 30 percent." };
  }

  const before = await prisma.platformSettings.findUnique({
    where: { id: SETTINGS_ID },
    select: { stripeForIndiaEnabled: true, paymentFeePercent: true },
  });

  await prisma.platformSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, stripeForIndiaEnabled, paymentFeePercent },
    update: { stripeForIndiaEnabled, paymentFeePercent },
  });

  await writeAuditLog({
    actor: admin,
    action: "settings.payments_update",
    metadata: {
      before,
      after: { stripeForIndiaEnabled, paymentFeePercent },
    },
  });

  revalidatePath("/admin/payments");
  return { ok: true, message: "Payments config saved." };
}

// Save Razorpay platform-account credentials. Follows the same rules as the
// Stripe settings form: empty secret submissions leave the stored value
// untouched (never echoed back), and the audit log records which fields
// changed, not their values.
export async function updateRazorpaySettingsAction(
  _prev: AdminPaymentsState,
  formData: FormData,
): Promise<AdminPaymentsState> {
  const admin = await requireAdminRole("SUPER_ADMIN");

  const modeInput = String(formData.get("razorpayMode") || "TEST").toUpperCase();
  const mode: "TEST" | "LIVE" = modeInput === "LIVE" ? "LIVE" : "TEST";

  const testKeyId = String(formData.get("razorpayTestKeyId") || "").trim() || null;
  const testKeySecret = String(formData.get("razorpayTestKeySecret") || "").trim();
  const testWebhookSecret = String(formData.get("razorpayTestWebhookSecret") || "").trim();
  const liveKeyId = String(formData.get("razorpayLiveKeyId") || "").trim() || null;
  const liveKeySecret = String(formData.get("razorpayLiveKeySecret") || "").trim();
  const liveWebhookSecret = String(formData.get("razorpayLiveWebhookSecret") || "").trim();

  const before = await prisma.platformSettings.findUnique({
    where: { id: SETTINGS_ID },
    select: { razorpayMode: true },
  });

  const changed: string[] = [];
  if (before?.razorpayMode !== mode) changed.push("razorpayMode");
  if (testKeyId !== undefined) changed.push("razorpayTestKeyId");
  if (testKeySecret) changed.push("razorpayTestKeySecret");
  if (testWebhookSecret) changed.push("razorpayTestWebhookSecret");
  if (liveKeyId !== undefined) changed.push("razorpayLiveKeyId");
  if (liveKeySecret) changed.push("razorpayLiveKeySecret");
  if (liveWebhookSecret) changed.push("razorpayLiveWebhookSecret");

  await prisma.platformSettings.upsert({
    where: { id: SETTINGS_ID },
    create: {
      id: SETTINGS_ID,
      razorpayMode: mode,
      razorpayTestKeyId: testKeyId,
      razorpayTestKeySecret: testKeySecret || null,
      razorpayTestWebhookSecret: testWebhookSecret || null,
      razorpayLiveKeyId: liveKeyId,
      razorpayLiveKeySecret: liveKeySecret || null,
      razorpayLiveWebhookSecret: liveWebhookSecret || null,
    },
    update: {
      razorpayMode: mode,
      razorpayTestKeyId: testKeyId,
      // Empty submission = untouched (never overwrite with null accidentally).
      ...(testKeySecret ? { razorpayTestKeySecret: testKeySecret } : {}),
      ...(testWebhookSecret ? { razorpayTestWebhookSecret: testWebhookSecret } : {}),
      razorpayLiveKeyId: liveKeyId,
      ...(liveKeySecret ? { razorpayLiveKeySecret: liveKeySecret } : {}),
      ...(liveWebhookSecret ? { razorpayLiveWebhookSecret: liveWebhookSecret } : {}),
    },
  });

  await writeAuditLog({
    actor: admin,
    action: "settings.razorpay_update",
    metadata: { mode, changed },
  });

  revalidatePath("/admin/payments");
  return { ok: true, message: "Razorpay credentials saved." };
}

// Wipe a specific Razorpay secret. Matches the "Clear" affordance next to
// each Stripe secret in /admin/settings.
export async function clearRazorpaySecretAction(
  _prev: AdminPaymentsState,
  formData: FormData,
): Promise<AdminPaymentsState> {
  const admin = await requireAdminRole("SUPER_ADMIN");
  const field = String(formData.get("field") || "");
  const allowed = new Set([
    "razorpayTestKeySecret",
    "razorpayTestWebhookSecret",
    "razorpayLiveKeySecret",
    "razorpayLiveWebhookSecret",
  ]);
  if (!allowed.has(field)) return { error: "Unknown field." };

  await prisma.platformSettings.update({
    where: { id: SETTINGS_ID },
    data: { [field]: null },
  });
  await writeAuditLog({ actor: admin, action: "settings.razorpay_clear", metadata: { field } });
  revalidatePath("/admin/payments");
  return { ok: true, message: "Secret cleared." };
}

// Reset a RELEASE_FAILED payout's retry counter so the next cron sweep will
// attempt the release again. Useful when the underlying cause (e.g. tenant
// finished onboarding, admin corrected a bank account) has been fixed. The
// row goes back to HELD so the standard cron picks it up.
export async function retryPayoutAction(
  _prev: AdminPaymentsState,
  formData: FormData,
): Promise<AdminPaymentsState> {
  const admin = await requireAdminRole("SUPER_ADMIN");
  const bookingId = String(formData.get("bookingId") || "");
  if (!bookingId) return { error: "Missing booking id." };

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { id: true, userId: true, payoutStatus: true },
  });
  if (!booking) return { error: "Booking not found." };
  if (booking.payoutStatus !== "RELEASE_FAILED") {
    return { error: "Only RELEASE_FAILED payouts can be retried." };
  }

  await prisma.booking.update({
    where: { id: bookingId },
    data: {
      payoutStatus: "HELD",
      payoutAttempts: 0,
      payoutFailureReason: null,
    },
  });

  await writeAuditLog({
    actor: admin,
    action: "payments.retry_payout",
    targetUserId: booking.userId,
    metadata: { bookingId },
  });

  logger.info({ bookingId, adminEmail: admin.email }, "Payout marked for retry");

  revalidatePath("/admin/payments");
  return { ok: true, message: "Payout queued for retry on the next cron run." };
}

// Manually refund a paid booking. Works whether the payout is still HELD
// (refunds the original charge directly) or already RELEASED (reverses the
// tenant's transfer first, then refunds the customer) — refundBookingPayment
// picks the right path. This is the only supported way to refund a booking
// after payout release; self-service cancel never triggers it post-release.
export async function manualRefundAction(
  _prev: AdminPaymentsState,
  formData: FormData,
): Promise<AdminPaymentsState> {
  const admin = await requireAdminRole("SUPER_ADMIN");
  const bookingId = String(formData.get("bookingId") || "");
  if (!bookingId) return { error: "Missing booking id." };

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { id: true, userId: true, paymentStatus: true },
  });
  if (!booking) return { error: "Booking not found." };
  if (booking.paymentStatus !== "PAID") {
    return { error: "This booking isn't in a refundable state." };
  }

  const result = await refundBookingPayment(bookingId);
  if (!result.ok) return { error: result.error };

  await writeAuditLog({
    actor: admin,
    action: "payments.manual_refund",
    targetUserId: booking.userId,
    metadata: { bookingId },
  });

  revalidatePath("/admin/payments");
  return { ok: true, message: "Booking refunded." };
}
