"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminRole } from "@/lib/admin-auth";
import { writeAuditLog } from "@/lib/admin-audit";

export async function toggleFeatureFlagAction(formData: FormData) {
  const admin = await requireAdminRole("SUPER_ADMIN");
  const key = String(formData.get("key") || "");
  const enabled = formData.get("enabled") === "true";
  if (!key) return;

  const before = await prisma.featureFlag.findUnique({ where: { key } });
  await prisma.featureFlag.update({
    where: { key },
    data: { enabled },
  });

  await writeAuditLog({
    actor: admin,
    action: "settings.feature_flag_update",
    metadata: {
      key,
      oldEnabled: before?.enabled,
      newEnabled: enabled,
    },
  });

  revalidatePath("/admin/settings/flags");
}
