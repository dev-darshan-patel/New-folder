"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminRole } from "@/lib/admin-auth";
import { writeAuditLog } from "@/lib/admin-audit";
import { getCurrentUser } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { SETTINGS_ID } from "@/lib/settings";

const PLAIN_FIELDS = [
  "gmailSmtpUser",
  "gmailSmtpFrom",
  "sesSmtpUser",
  "sesRegion",
  "sesFromAddress",
] as const;

const SECRET_FIELDS = ["gmailSmtpPass", "sesSmtpPass"] as const;

export async function updateEmailSettingsAction(formData: FormData) {
  const admin = await requireAdminRole("SUPER_ADMIN");

  const rawProvider = String(formData.get("emailProvider") || "NONE");
  const provider = ["NONE", "GMAIL_SMTP", "AMAZON_SES"].includes(rawProvider)
    ? rawProvider
    : "NONE";

  const data: Record<string, string | null> = { emailProvider: provider };

  for (const field of PLAIN_FIELDS) {
    const v = String(formData.get(field) ?? "").trim();
    data[field] = v === "" ? null : v;
  }

  const changedSecrets: string[] = [];
  for (const field of SECRET_FIELDS) {
    const v = String(formData.get(field) ?? "").trim();
    if (v !== "") {
      data[field] = v;
      changedSecrets.push(field);
    }
  }

  await prisma.platformSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, ...data },
    update: data,
  });

  await writeAuditLog({
    actor: admin,
    action: "settings.email_update",
    metadata: { provider, secretsChanged: changedSecrets },
  });

  revalidatePath("/admin/settings/email");
}

export async function clearEmailSecretAction(formData: FormData) {
  const admin = await requireAdminRole("SUPER_ADMIN");
  const field = String(formData.get("field") || "");
  if (!["gmailSmtpPass", "sesSmtpPass"].includes(field)) return;

  await prisma.platformSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, [field]: null },
    update: { [field]: null },
  });

  await writeAuditLog({
    actor: admin,
    action: "settings.email_clear_field",
    metadata: { field },
  });

  revalidatePath("/admin/settings/email");
}

export async function sendTestEmailAction(
  targetEmail: string,
): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireAdminRole("SUPER_ADMIN");
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  const to = targetEmail.trim();
  if (!to || !to.includes("@")) return { ok: false, error: "Enter a valid email address." };

  try {
    await sendEmail({
      to,
      subject: "Test email from your booking platform",
      text: `This is a test email sent from the platform admin console.\n\nIf you received this, email delivery is working correctly!`,
    });
    await writeAuditLog({
      actor: admin,
      action: "settings.email_test_sent",
      metadata: { sentTo: to },
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}
