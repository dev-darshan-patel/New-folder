"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminRole } from "@/lib/admin-auth";
import { writeAuditLog } from "@/lib/admin-audit";
import { SETTINGS_ID } from "@/lib/settings";

const MAX_LEGAL = 100_000;

// Save the published text for /terms and /privacy. Each document's
// "last updated" stamp only moves when that document's text actually changed —
// people rely on that date to spot real changes to an agreement, so bumping it
// on an unrelated save would be misleading.
export async function updateLegalContentAction(formData: FormData): Promise<void> {
  const admin = await requireAdminRole("SUPER_ADMIN");

  const terms = String(formData.get("termsContent") ?? "").slice(0, MAX_LEGAL).trim() || null;
  const privacy = String(formData.get("privacyContent") ?? "").slice(0, MAX_LEGAL).trim() || null;

  const before = await prisma.platformSettings.findUnique({
    where: { id: SETTINGS_ID },
    select: { termsContent: true, privacyContent: true },
  });
  const now = new Date();
  const termsChanged = (before?.termsContent ?? null) !== terms;
  const privacyChanged = (before?.privacyContent ?? null) !== privacy;

  await prisma.platformSettings.upsert({
    where: { id: SETTINGS_ID },
    create: {
      id: SETTINGS_ID,
      termsContent: terms,
      privacyContent: privacy,
      termsUpdatedAt: terms ? now : null,
      privacyUpdatedAt: privacy ? now : null,
    },
    update: {
      termsContent: terms,
      privacyContent: privacy,
      ...(termsChanged ? { termsUpdatedAt: terms ? now : null } : {}),
      ...(privacyChanged ? { privacyUpdatedAt: privacy ? now : null } : {}),
    },
  });

  await writeAuditLog({
    actor: admin,
    action: "settings.legal_update",
    // Never log the documents themselves — they're large and the audit log is
    // append-only. Which one changed is the useful fact.
    metadata: { termsChanged, privacyChanged },
  });
  revalidatePath("/admin/settings/legal");
  revalidatePath("/terms");
  revalidatePath("/privacy");
}
