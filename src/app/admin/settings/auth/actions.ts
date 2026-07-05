"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminRole } from "@/lib/admin-auth";
import { writeAuditLog } from "@/lib/admin-audit";
import { SETTINGS_ID } from "@/lib/settings";

// Client IDs and the tenant string aren't secret (Google/Microsoft both treat
// them as public, embedded in the redirect URL) so they're saved directly;
// an empty submission clears them. Client secrets follow the same
// never-prefilled / "leave blank to keep" pattern as the Stripe panel.
const PLAIN_FIELDS = ["googleClientId", "microsoftClientId", "microsoftTenant", "zoomClientId"] as const;
const SECRET_FIELDS = ["googleClientSecret", "microsoftClientSecret", "zoomClientSecret"] as const;

export async function updateAuthSettingsAction(formData: FormData) {
  const admin = await requireAdminRole("SUPER_ADMIN");

  const data: Record<string, string | null> = {};
  for (const field of PLAIN_FIELDS) {
    const v = String(formData.get(field) ?? "").trim();
    if (field === "microsoftTenant") {
      data[field] = v || "common";
    } else {
      data[field] = v === "" ? null : v;
    }
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
    action: "settings.auth_update",
    metadata: {
      plainFieldsSet: PLAIN_FIELDS.filter((f) => data[f] !== null),
      secretsChanged: changedSecrets,
    },
  });

  revalidatePath("/admin/settings/auth");
}

const CLEARABLE = new Set<string>(SECRET_FIELDS);

export async function clearAuthSecretAction(formData: FormData) {
  const admin = await requireAdminRole("SUPER_ADMIN");
  const field = String(formData.get("field") || "");
  if (!CLEARABLE.has(field)) return;

  await prisma.platformSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, [field]: null },
    update: { [field]: null },
  });

  await writeAuditLog({
    actor: admin,
    action: "settings.auth_clear_field",
    metadata: { field },
  });

  revalidatePath("/admin/settings/auth");
}
