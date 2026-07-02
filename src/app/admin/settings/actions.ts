"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminRole } from "@/lib/admin-auth";
import { writeAuditLog } from "@/lib/admin-audit";
import { SETTINGS_ID } from "@/lib/settings";

// Fields the admin can edit directly — an empty submitted value clears them.
// Secret-ish fields are handled separately (see below) since their inputs are
// never pre-filled, so "empty" there means "unchanged", not "clear".
const PLAIN_FIELDS = [
  "stripeTestPublishableKey",
  "stripeTestPricePro",
  "stripeTestPriceBusiness",
  "stripeLivePublishableKey",
  "stripeLivePricePro",
  "stripeLivePriceBusiness",
] as const;

// Secret fields: only overwritten when the admin actually types a new value.
const SECRET_FIELDS = [
  "stripeTestSecretKey",
  "stripeTestWebhookSecret",
  "stripeLiveSecretKey",
  "stripeLiveWebhookSecret",
] as const;

export async function updateStripeSettingsAction(formData: FormData) {
  const admin = await requireAdminRole("SUPER_ADMIN");

  const mode = formData.get("stripeMode") === "LIVE" ? "LIVE" : "TEST";

  const data: Record<string, string | null> = { stripeMode: mode };
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

  // Never write key values into the audit log — only which fields changed.
  await writeAuditLog({
    actor: admin,
    action: "settings.stripe_update",
    metadata: {
      mode,
      plainFieldsSet: PLAIN_FIELDS.filter((f) => data[f] !== null),
      secretsChanged: changedSecrets,
    },
  });

  revalidatePath("/admin/settings");
  revalidatePath("/dashboard/billing");
}

const CLEARABLE = new Set<string>(SECRET_FIELDS);

export async function clearStripeSecretAction(formData: FormData) {
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
    action: "settings.stripe_clear_field",
    metadata: { field },
  });

  revalidatePath("/admin/settings");
  revalidatePath("/dashboard/billing");
}
