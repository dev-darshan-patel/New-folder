"use server";

import { prisma } from "@/lib/prisma";
import { requireAdminRole } from "@/lib/admin-auth";
import { writeAuditLog } from "@/lib/admin-audit";
import { sendEmail } from "@/lib/email";

export type BroadcastState =
  | { ok: true; sent: number; failed: number }
  | { error: string }
  | null;

export async function sendBroadcastAction(
  _prev: BroadcastState,
  formData: FormData,
): Promise<BroadcastState> {
  const admin = await requireAdminRole("SUPER_ADMIN");

  const subject = String(formData.get("subject") || "").trim();
  const body = String(formData.get("body") || "").trim();
  const confirm = String(formData.get("confirm") || "");
  if (!subject || !body) return { error: "Subject and message are required." };
  if (confirm !== "SEND") {
    return { error: "Type SEND in the confirmation box to proceed." };
  }

  const recipients = await prisma.user.findMany({
    where: { deletedAt: null, suspended: false },
    select: { email: true, name: true },
  });

  // Deliberately sequential — avoids SMTP rate-limit surprises (Gmail etc.).
  // If the tenant count grows large, move this to a proper job queue.
  let sent = 0;
  let failed = 0;
  for (const r of recipients) {
    try {
      await sendEmail({ to: r.email, subject, text: `Hi ${r.name},\n\n${body}` });
      sent++;
    } catch (err) {
      console.error(`Broadcast failed for ${r.email}`, err);
      failed++;
    }
  }

  await writeAuditLog({
    actor: admin,
    action: "broadcast.send",
    metadata: { subject, recipients: recipients.length, sent, failed },
  });

  return { ok: true, sent, failed };
}
