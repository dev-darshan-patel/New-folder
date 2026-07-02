"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminRole } from "@/lib/admin-auth";
import { writeAuditLog } from "@/lib/admin-audit";

const LEVELS = ["INFO", "WARNING", "CRITICAL"];

function revalidate() {
  revalidatePath("/admin/announcements");
  revalidatePath("/dashboard");
}

export async function createAnnouncementAction(formData: FormData) {
  const admin = await requireAdminRole("SUPER_ADMIN");

  const message = String(formData.get("message") || "").trim();
  const levelRaw = String(formData.get("level") || "").trim();
  const level = LEVELS.includes(levelRaw) ? levelRaw : "INFO";
  const expiresRaw = String(formData.get("expiresAt") || "").trim();
  const parsed = expiresRaw ? new Date(expiresRaw) : null;
  const expiresAt = parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;

  if (!message) throw new Error("Message is required.");

  const announcement = await prisma.announcement.create({
    data: { message: message.slice(0, 500), level, expiresAt, createdBy: admin.email },
  });

  await writeAuditLog({
    actor: admin,
    action: "announcement.create",
    metadata: {
      id: announcement.id,
      level,
      expiresAt: expiresAt?.toISOString() ?? null,
    },
  });

  revalidate();
}

export async function setAnnouncementActiveAction(formData: FormData) {
  const admin = await requireAdminRole("SUPER_ADMIN");
  const id = String(formData.get("id") || "");
  const active = formData.get("active") === "1";
  if (!id) return;

  const announcement = await prisma.announcement.findUnique({ where: { id } });
  if (!announcement) return;

  await prisma.announcement.update({ where: { id }, data: { active } });
  await writeAuditLog({
    actor: admin,
    action: "announcement.toggle",
    metadata: { id, active },
  });

  revalidate();
}

export async function deleteAnnouncementAction(formData: FormData) {
  const admin = await requireAdminRole("SUPER_ADMIN");
  const id = String(formData.get("id") || "");
  if (!id) return;

  const announcement = await prisma.announcement.findUnique({ where: { id } });
  if (!announcement) return;

  await prisma.announcement.delete({ where: { id } });
  await writeAuditLog({
    actor: admin,
    action: "announcement.delete",
    metadata: { id, message: announcement.message.slice(0, 100) },
  });

  revalidate();
}
