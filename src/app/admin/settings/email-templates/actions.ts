"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminRole } from "@/lib/admin-auth";
import { writeAuditLog } from "@/lib/admin-audit";
import { sendEmail } from "@/lib/email";
import {
  getTemplateDef,
  interpolate,
  wrapHtml,
} from "@/lib/email-templates";

export type TemplateFormState = { ok: true; message: string } | { error: string } | null;

// Save subject/html/text edits for a template.
export async function updateEmailTemplateAction(
  _prev: TemplateFormState,
  formData: FormData,
): Promise<TemplateFormState> {
  const admin = await requireAdminRole("SUPER_ADMIN");
  const key = String(formData.get("key") || "");
  const subject = String(formData.get("subject") || "").trim();
  const html = String(formData.get("html") || "");
  const text = String(formData.get("text") || "");

  const def = getTemplateDef(key);
  if (!def) return { error: "Unknown template." };
  if (!subject) return { error: "Subject is required." };
  if (!text.trim()) return { error: "Plain-text body is required (used as email fallback)." };

  await prisma.emailTemplate.upsert({
    where: { key },
    create: { key, category: def.category, name: def.name, subject, html, text, enabled: true },
    update: { subject, html, text },
  });

  await writeAuditLog({
    actor: admin,
    action: "settings.email_template_update",
    metadata: { key },
  });

  revalidatePath("/admin/settings/email-templates");
  revalidatePath(`/admin/settings/email-templates/${key}`);
  return { ok: true, message: "Template saved." };
}

// Enable/disable a template. Disabled falls back to the hardcoded default.
export async function toggleEmailTemplateAction(formData: FormData) {
  const admin = await requireAdminRole("SUPER_ADMIN");
  const key = String(formData.get("key") || "");
  const enabled = formData.get("enabled") === "true";
  const def = getTemplateDef(key);
  if (!def) return;

  await prisma.emailTemplate.upsert({
    where: { key },
    create: {
      key,
      category: def.category,
      name: def.name,
      subject: def.subject,
      html: def.html,
      text: def.text,
      enabled,
    },
    update: { enabled },
  });

  await writeAuditLog({
    actor: admin,
    action: "settings.email_template_toggle",
    metadata: { key, enabled },
  });

  revalidatePath("/admin/settings/email-templates");
  revalidatePath(`/admin/settings/email-templates/${key}`);
}

// Reset a template back to its shipped default.
export async function resetEmailTemplateAction(formData: FormData) {
  const admin = await requireAdminRole("SUPER_ADMIN");
  const key = String(formData.get("key") || "");
  const def = getTemplateDef(key);
  if (!def) return;

  await prisma.emailTemplate.upsert({
    where: { key },
    create: {
      key,
      category: def.category,
      name: def.name,
      subject: def.subject,
      html: def.html,
      text: def.text,
      enabled: true,
    },
    update: { subject: def.subject, html: def.html, text: def.text },
  });

  await writeAuditLog({
    actor: admin,
    action: "settings.email_template_reset",
    metadata: { key },
  });

  revalidatePath(`/admin/settings/email-templates/${key}`);
}

// Send a test render (using sample variable values) to an address.
export async function sendTemplateTestAction(
  key: string,
  targetEmail: string,
): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireAdminRole("SUPER_ADMIN");
  const to = targetEmail.trim();
  if (!to || !to.includes("@")) return { ok: false, error: "Enter a valid email address." };

  const def = getTemplateDef(key);
  if (!def) return { ok: false, error: "Unknown template." };

  // Use the saved row if present, else the default, filled with sample values.
  const row = await prisma.emailTemplate.findUnique({ where: { key } });
  const ctx: Record<string, string> = {};
  for (const v of def.vars) ctx[v.name] = v.sample;

  const subject = interpolate(row?.subject ?? def.subject, ctx);
  const html = wrapHtml(interpolate(row?.html ?? def.html, ctx));
  const text = interpolate(row?.text ?? def.text, ctx);

  try {
    await sendEmail({ to, subject: `[TEST] ${subject}`, text, html });
    await writeAuditLog({
      actor: admin,
      action: "settings.email_template_test",
      metadata: { key, sentTo: to },
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}
