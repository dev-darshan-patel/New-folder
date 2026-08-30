"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminRole } from "@/lib/admin-auth";
import { writeAuditLog } from "@/lib/admin-audit";

// Mark an error as handled. A later recurrence clears this automatically
// (see captureError), so resolving can't hide a problem that comes back.
export async function resolveErrorAction(formData: FormData): Promise<void> {
  const admin = await requireAdminRole("SUPPORT");
  const id = String(formData.get("id") || "");
  const event = await prisma.errorEvent.findUnique({
    where: { id },
    select: { message: true },
  });
  if (!event) return;

  await prisma.errorEvent.update({ where: { id }, data: { resolvedAt: new Date() } });
  await writeAuditLog({
    actor: admin,
    action: "error.resolve",
    targetLabel: event.message.slice(0, 120),
  });
  revalidatePath("/admin/errors");
}

// Delete an error outright — for noise that isn't worth keeping.
export async function deleteErrorAction(formData: FormData): Promise<void> {
  const admin = await requireAdminRole("SUPPORT");
  const id = String(formData.get("id") || "");
  const event = await prisma.errorEvent.findUnique({
    where: { id },
    select: { message: true },
  });
  if (!event) return;

  await prisma.errorEvent.delete({ where: { id } });
  await writeAuditLog({
    actor: admin,
    action: "error.delete",
    targetLabel: event.message.slice(0, 120),
  });
  revalidatePath("/admin/errors");
}
