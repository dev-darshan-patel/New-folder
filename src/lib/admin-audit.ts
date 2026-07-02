import "server-only";
import { prisma } from "@/lib/prisma";
import type { User } from "@prisma/client";

export async function writeAuditLog(params: {
  actor: User;
  action: string;
  targetUserId?: string;
  targetLabel?: string;
  metadata?: Record<string, unknown>;
}) {
  await prisma.adminAuditLog.create({
    data: {
      actorId: params.actor.id,
      actorEmail: params.actor.email,
      action: params.action,
      targetUserId: params.targetUserId,
      targetLabel: params.targetLabel,
      metadata: params.metadata ? JSON.stringify(params.metadata) : null,
    },
  });
}
