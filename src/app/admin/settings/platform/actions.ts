"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminRole } from "@/lib/admin-auth";
import { writeAuditLog } from "@/lib/admin-audit";
import { SETTINGS_ID } from "@/lib/settings";

export async function updatePlatformConfigAction(formData: FormData) {
  const admin = await requireAdminRole("SUPER_ADMIN");

  const maintenanceMode = formData.get("maintenanceMode") === "on";
  const signupsEnabled = formData.get("signupsEnabled") === "on";
  const maintenanceMessage =
    String(formData.get("maintenanceMessage") ?? "").trim().slice(0, 500) || null;
  const supportEmail =
    String(formData.get("supportEmail") ?? "").trim().slice(0, 200) || null;

  const before = await prisma.platformSettings.findUnique({ where: { id: SETTINGS_ID } });

  await prisma.platformSettings.upsert({
    where: { id: SETTINGS_ID },
    create: {
      id: SETTINGS_ID,
      maintenanceMode,
      signupsEnabled,
      maintenanceMessage,
      supportEmail,
    },
    update: {
      maintenanceMode,
      signupsEnabled,
      maintenanceMessage,
      supportEmail,
    },
  });

  await writeAuditLog({
    actor: admin,
    action: "settings.platform_update",
    metadata: {
      before: before
        ? {
            maintenanceMode: before.maintenanceMode,
            signupsEnabled: before.signupsEnabled,
          }
        : null,
      after: { maintenanceMode, signupsEnabled },
    },
  });

  revalidatePath("/admin/settings/platform");
  revalidatePath("/");
  revalidatePath("/signup");
}
