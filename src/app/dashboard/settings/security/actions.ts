"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { generateTotpSecret, verifyTotp, generateBackupCodes } from "@/lib/totp";

export type SecurityState =
  | { ok: true; message: string; backupCodes?: string[] }
  | { error: string }
  | null;

// Save a fresh secret + qr so the user can scan without we storing anything
// enabled. Enrollment isn't committed as `enabled` until verifyEnableTotpAction
// confirms a real code.
export async function beginTotpSetupAction(): Promise<{ secret: string } | { error: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" };
  if (user.totpEnabled) return { error: "2FA is already enabled." };
  const secret = generateTotpSecret();
  await prisma.user.update({
    where: { id: user.id },
    data: { totpSecret: secret, totpEnabled: false },
  });
  revalidatePath("/dashboard/settings/security");
  return { secret };
}

export async function verifyEnableTotpAction(
  _prev: SecurityState,
  formData: FormData,
): Promise<SecurityState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" };
  if (!user.totpSecret) return { error: "Start 2FA setup first." };
  const code = String(formData.get("code") || "").trim();
  if (!verifyTotp(user.totpSecret, code)) return { error: "That code isn't valid. Try again." };

  const { plain, hashed } = await generateBackupCodes(10);
  await prisma.user.update({
    where: { id: user.id },
    data: { totpEnabled: true, totpBackupCodes: JSON.stringify(hashed) },
  });

  revalidatePath("/dashboard/settings/security");
  return { ok: true, message: "2FA is now enabled.", backupCodes: plain };
}

export async function disableTotpAction(
  _prev: SecurityState,
  formData: FormData,
): Promise<SecurityState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" };
  const password = String(formData.get("password") || "");
  if (!user.passwordHash) return { error: "This account has no password." };
  if (!(await bcrypt.compare(password, user.passwordHash))) {
    return { error: "Password incorrect." };
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { totpEnabled: false, totpSecret: null, totpBackupCodes: null },
  });
  revalidatePath("/dashboard/settings/security");
  return { ok: true, message: "2FA disabled." };
}
