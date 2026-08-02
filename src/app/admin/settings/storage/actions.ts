"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminRole } from "@/lib/admin-auth";
import { writeAuditLog } from "@/lib/admin-audit";
import { SETTINGS_ID } from "@/lib/settings";
import { encryptIfConfigured } from "@/lib/crypto";
import { getStorageProvider } from "@/lib/storage";

const PROVIDER_VALUES = new Set(["AUTO", "LOCAL", "VERCEL_BLOB", "S3"]);

const PLAIN_FIELDS = ["s3Bucket", "s3Region", "s3Endpoint", "s3PublicUrlBase", "s3AccessKeyId"] as const;
const SECRET_FIELDS = ["vercelBlobReadWriteToken", "s3SecretAccessKey"] as const;

export async function updateStorageSettingsAction(formData: FormData) {
  const admin = await requireAdminRole("SUPER_ADMIN");

  const rawProvider = String(formData.get("storageProvider") || "AUTO");
  const storageProvider = PROVIDER_VALUES.has(rawProvider) ? rawProvider : "AUTO";
  const s3ForcePathStyle = formData.get("s3ForcePathStyle") === "on";

  const data: Record<string, string | boolean | null> = { storageProvider, s3ForcePathStyle };
  for (const field of PLAIN_FIELDS) {
    const v = String(formData.get(field) ?? "").trim();
    data[field] = v === "" ? null : v;
  }

  const changedSecrets: string[] = [];
  for (const field of SECRET_FIELDS) {
    const v = String(formData.get(field) ?? "").trim();
    if (v !== "") {
      data[field] = encryptIfConfigured(v);
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
    action: "settings.storage_update",
    metadata: {
      storageProvider,
      plainFieldsSet: PLAIN_FIELDS.filter((f) => data[f] !== null),
      secretsChanged: changedSecrets,
    },
  });

  revalidatePath("/admin/settings/storage");
}

const CLEARABLE = new Set<string>(SECRET_FIELDS);

export async function clearStorageSecretAction(formData: FormData) {
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
    action: "settings.storage_clear_field",
    metadata: { field },
  });

  revalidatePath("/admin/settings/storage");
}

// Tests whatever is currently SAVED (not unsaved form edits) — same rule as
// the "Send test email" button. Round-trips a tiny throwaway object through
// put/delete so a misconfigured bucket/key is caught here, not on a real
// tenant's first avatar upload.
export async function testStorageConnectionAction(): Promise<{ ok: boolean; error?: string }> {
  await requireAdminRole("SUPER_ADMIN");

  try {
    const storage = await getStorageProvider();
    const key = `_storage-test/${Date.now()}.txt`;
    const { url } = await storage.put(key, Buffer.from("bookify storage test"), "text/plain");
    await storage.delete(url);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
