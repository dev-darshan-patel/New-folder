"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { planConfig } from "@/lib/plans";

async function requireTeamSchedulingUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  if (!planConfig(user.plan).teamScheduling) {
    throw new Error("Team scheduling requires the Business plan.");
  }
  return user;
}

export async function addTeamMemberAction(formData: FormData) {
  const user = await requireTeamSchedulingUser();
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim() || null;
  if (!name) return;

  await prisma.teamMember.create({
    data: { userId: user.id, name, email },
  });
  revalidatePath("/dashboard/team");
}

export async function removeTeamMemberAction(formData: FormData) {
  const user = await requireTeamSchedulingUser();
  const id = String(formData.get("id") || "");

  // The owner's record can never be hard-deleted, only deactivated.
  const member = await prisma.teamMember.findFirst({ where: { id, userId: user.id } });
  if (!member || member.isOwner) return;

  await prisma.teamMember.delete({ where: { id } });
  revalidatePath("/dashboard/team");
}

export async function setMemberActiveAction(formData: FormData) {
  const user = await requireTeamSchedulingUser();
  const id = String(formData.get("id") || "");
  const active = formData.get("active") === "1";

  await prisma.teamMember.updateMany({
    where: { id, userId: user.id },
    data: { active },
  });
  revalidatePath("/dashboard/team");
}

export async function setOwnerParticipationAction(formData: FormData) {
  const user = await requireTeamSchedulingUser();
  const active = formData.get("active") === "1";

  await prisma.teamMember.updateMany({
    where: { userId: user.id, isOwner: true },
    data: { active },
  });
  revalidatePath("/dashboard/team");
}

function toMinutes(hhmm: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

export async function updateMemberAvailabilityAction(formData: FormData) {
  const user = await requireTeamSchedulingUser();
  const teamMemberId = String(formData.get("teamMemberId") || "");

  const member = await prisma.teamMember.findFirst({
    where: { id: teamMemberId, userId: user.id },
  });
  if (!member) return;

  const rows: { weekday: number; startMinutes: number; endMinutes: number }[] = [];
  for (let weekday = 0; weekday < 7; weekday++) {
    if (formData.get(`enabled-${weekday}`) !== "on") continue;
    const start = toMinutes(String(formData.get(`start-${weekday}`) || ""));
    const end = toMinutes(String(formData.get(`end-${weekday}`) || ""));
    if (start === null || end === null || end <= start) continue;
    rows.push({ weekday, startMinutes: start, endMinutes: end });
  }

  await prisma.$transaction([
    prisma.availability.deleteMany({ where: { teamMemberId } }),
    prisma.availability.createMany({
      data: rows.map((r) => ({ ...r, userId: user.id, teamMemberId })),
    }),
  ]);

  revalidatePath(`/dashboard/team/${teamMemberId}/availability`);
}
