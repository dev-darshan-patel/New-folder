import "server-only";
import { prisma } from "@/lib/prisma";

export type BusyWindow = { start: Date; end: Date };

// Where a team member is already committed, regardless of which event type
// caused it — a person can't double-book across SOLO/ROUND_ROBIN/COLLECTIVE.
export async function getTeamMemberBusyWindows(
  teamMemberId: string,
  dayStartUtc: Date,
  dayEndUtc: Date,
): Promise<BusyWindow[]> {
  const member = await prisma.teamMember.findUnique({
    where: { id: teamMemberId },
    select: { userId: true, isOwner: true },
  });
  if (!member) return [];

  const inRange = {
    status: "CONFIRMED" as const,
    startTime: { lt: dayEndUtc },
    endTime: { gt: dayStartUtc },
  };

  const [ownAssignments, collectivePools, ownerSolo] = await Promise.all([
    prisma.booking.findMany({
      where: { ...inRange, teamMemberId },
      select: { startTime: true, endTime: true },
    }),
    prisma.booking.findMany({
      where: {
        ...inRange,
        eventType: {
          assignmentMode: "COLLECTIVE",
          members: { some: { teamMemberId } },
        },
      },
      select: { startTime: true, endTime: true },
    }),
    member.isOwner
      ? prisma.booking.findMany({
          where: {
            ...inRange,
            userId: member.userId,
            eventType: { assignmentMode: "SOLO" },
          },
          select: { startTime: true, endTime: true },
        })
      : Promise.resolve([]),
  ]);

  return [...ownAssignments, ...collectivePools, ...ownerSolo].map((b) => ({
    start: b.startTime,
    end: b.endTime,
  }));
}

export function isFreeAt(busy: BusyWindow[], start: Date, end: Date): boolean {
  return !busy.some((b) => start < b.end && end > b.start);
}

// Among candidates known to be free (freeIds), pick whoever has gone the
// longest without an assignment (oldest/null lastAssignedAt wins).
export function pickRoundRobinMember<
  T extends { id: string; lastAssignedAt: Date | null },
>(candidates: T[], freeIds: Set<string>): T | null {
  const free = candidates.filter((c) => freeIds.has(c.id));
  if (free.length === 0) return null;
  free.sort((a, b) => {
    const at = a.lastAssignedAt?.getTime() ?? 0;
    const bt = b.lastAssignedAt?.getTime() ?? 0;
    return at - bt;
  });
  return free[0];
}

// Lazily create the implicit record representing the owner themselves, so
// they can be added to a pool. Inactive by default (must opt in). Idempotent.
export async function ensureOwnerTeamMember(
  userId: string,
  ownerName: string,
): Promise<{ id: string }> {
  const existing = await prisma.teamMember.findFirst({
    where: { userId, isOwner: true },
    select: { id: true },
  });
  if (existing) return existing;
  return prisma.teamMember.create({
    data: { userId, name: ownerName, isOwner: true, active: false },
    select: { id: true },
  });
}
