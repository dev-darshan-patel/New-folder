"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import {
  createSession,
  destroySession,
  createPending2faToken,
  readPending2fa,
  clearPending2fa,
} from "@/lib/auth";
import { uniqueUserSlug } from "@/lib/slug";
import { sendEmail } from "@/lib/email";
import { renderTemplate } from "@/lib/email-templates";
import { verifyTotp, consumeBackupCode } from "@/lib/totp";
import { rateLimit, clientIp } from "@/lib/rate-limit";

import { getPlatformConfig } from "@/lib/platform-config";

export type AuthState = { error: string } | null;
export type ResetRequestState = { ok: true } | { error: string } | null;

export async function signupAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  if (!(await rateLimit(`signup:${await clientIp()}`, 5, 3_600_000))) {
    return { error: "Too many attempts. Try again in a few minutes." };
  }
  const { signupsEnabled } = await getPlatformConfig();
  if (!signupsEnabled) {
    return { error: "New signups are temporarily disabled." };
  }
  const name = String(formData.get("name") || "").trim();
  const businessName = String(formData.get("businessName") || "").trim();
  const email = String(formData.get("email") || "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") || "");
  const timezone = String(formData.get("timezone") || "UTC") || "UTC";

  if (!name || !businessName || !email || !password) {
    return { error: "All fields are required." };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { error: "An account with that email already exists." };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const slug = await uniqueUserSlug(businessName);
  const verifyToken = crypto.randomUUID();

  const user = await prisma.user.create({
    data: {
      name,
      businessName,
      email,
      passwordHash,
      slug,
      timezone,
      emailVerifiedAt: null,
      emailVerifyToken: verifyToken,
      emailVerifyExpiresAt: new Date(Date.now() + 86_400_000),
      // Sensible defaults so the booking page works right away.
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
  });

  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  try {
    const mail = await renderTemplate("auth.verify_email", {
      user_name: name,
      verify_url: `${base}/verify-email/${verifyToken}`,
    });
    await sendEmail({ to: email, ...mail });
  } catch (err) {
    console.error("Failed to send verification email", err);
  }

  // Log them in but send them to the "verify your email" gate — they can't
  // reach any dashboard feature until they click the link we just emailed.
  await createSession(user.id);
  redirect("/verify-email");
}

export async function loginAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  if (!(await rateLimit(`login:${await clientIp()}`, 10, 300_000))) {
    return { error: "Too many attempts. Try again in a few minutes." };
  }
  const email = String(formData.get("email") || "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") || "");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }
  if (!(await rateLimit(`login:${email}`, 5, 300_000))) {
    return { error: "Too many attempts. Try again in a few minutes." };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) {
    return {
      error: user
        ? "This account signs in with Google or Microsoft — use one of those buttons instead."
        : "Invalid email or password.",
    };
  }
  if (user.deletedAt) {
    return { error: "This account no longer exists." };
  }
  if (user.suspended) {
    return { error: "This account has been suspended. Contact support." };
  }
  // Account lockout: block login if too many recent failed attempts.
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const mins = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
    return { error: `Account temporarily locked. Try again in ${mins} minute${mins === 1 ? "" : "s"}.` };
  }
  if (!(await bcrypt.compare(password, user.passwordHash))) {
    const attempts = user.failedLoginAttempts + 1;
    const lockout = attempts >= 5 ? new Date(Date.now() + 15 * 60_000) : null;
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: attempts, lockedUntil: lockout },
    });
    if (lockout) {
      try {
        const mail = await renderTemplate("auth.account_locked", {
          user_name: user.name,
        });
        await sendEmail({ to: user.email, ...mail });
      } catch { /* best-effort */ }
      return { error: "Too many failed attempts. Account locked for 15 minutes. Check your email." };
    }
    return { error: "Invalid email or password." };
  }
  // Successful login — clear lockout counters.
  if (user.failedLoginAttempts > 0 || user.lockedUntil) {
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });
  }

  if (user.totpEnabled) {
    await createPending2faToken(user.id);
    redirect("/login/2fa");
  }

  await createSession(user.id);
  redirect(user.adminRole ? "/admin" : "/dashboard");
}

export async function verifyTwoFactorAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  if (!(await rateLimit(`2fa:${await clientIp()}`, 10, 300_000))) {
    return { error: "Too many attempts. Try again in a few minutes." };
  }
  const pending = await readPending2fa();
  if (!pending) return { error: "Your login session expired. Sign in again." };

  const submitted = String(formData.get("code") || "").trim();
  if (!submitted) return { error: "Enter your 6-digit code." };

  const user = await prisma.user.findUnique({ where: { id: pending.userId } });
  if (!user || !user.totpEnabled || !user.totpSecret) {
    await clearPending2fa();
    return { error: "This account isn't set up for 2FA. Sign in again." };
  }
  if (user.deletedAt || user.suspended) {
    await clearPending2fa();
    return { error: "This account is not available." };
  }

  // Try TOTP first.
  if (verifyTotp(user.totpSecret, submitted)) {
    await clearPending2fa();
    await createSession(user.id);
    redirect(user.adminRole ? "/admin" : "/dashboard");
  }

  // Fall back to backup code.
  if (user.totpBackupCodes) {
    try {
      const codes: string[] = JSON.parse(user.totpBackupCodes);
      const remaining = await consumeBackupCode(submitted, codes);
      if (remaining) {
        await prisma.user.update({
          where: { id: user.id },
          data: { totpBackupCodes: JSON.stringify(remaining) },
        });
        await clearPending2fa();
        await createSession(user.id);
        redirect(user.adminRole ? "/admin" : "/dashboard");
      }
    } catch {
      // fall through to error below
    }
  }

  return { error: "That code was not accepted. Try again." };
}

export async function requestPasswordResetAction(
  _prev: ResetRequestState,
  formData: FormData,
): Promise<ResetRequestState> {
  // Return the success shape when limited so this can't be used to probe.
  if (!(await rateLimit(`pwreset:${await clientIp()}`, 5, 900_000))) {
    return { ok: true };
  }
  const email = String(formData.get("email") || "")
    .trim()
    .toLowerCase();
  if (!email) return { error: "Enter your email address." };

  const user = await prisma.user.findUnique({ where: { email } });

  // Only send to real, active, password-based accounts — but always return the
  // same response so we don't reveal which emails exist.
  if (user && user.passwordHash && !user.deletedAt && !user.suspended) {
    const token = crypto.randomUUID();
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: token,
        passwordResetExpiresAt: new Date(Date.now() + 3_600_000),
      },
    });
    const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const resetUrl = `${base}/reset-password/${token}`;
    try {
      const mail = await renderTemplate("auth.password_reset", {
        user_name: user.name,
        reset_url: resetUrl,
      });
      await sendEmail({ to: user.email, ...mail });
    } catch (err) {
      console.error("Failed to send password reset email", err);
    }
  }

  return { ok: true };
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
