import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseQuestions } from "@/lib/intake";
import { planConfig } from "@/lib/plans";
import EventTypeEditor from "./EventTypeEditor";

export default async function EditEventTypePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return null;

  const eventType = await prisma.eventType.findFirst({
    where: { id, userId: user.id },
  });
  if (!eventType) notFound();

  const teamSchedulingEnabled = planConfig(user.plan).teamScheduling;
  const [teamMembers, pool] = teamSchedulingEnabled
    ? await Promise.all([
        prisma.teamMember.findMany({
          where: { userId: user.id, active: true },
          select: { id: true, name: true, isOwner: true },
          orderBy: [{ isOwner: "desc" }, { name: "asc" }],
        }),
        prisma.eventTypeMember.findMany({
          where: { eventTypeId: eventType.id },
          select: { teamMemberId: true },
        }),
      ])
    : [[], []];

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/dashboard/event-types"
        className="text-sm font-medium text-slate-500 hover:text-slate-900"
      >
        ← Event types
      </Link>
      <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
        Edit event type
      </h1>

      <EventTypeEditor
        initial={{
          id: eventType.id,
          title: eventType.title,
          description: eventType.description ?? "",
          durationMinutes: eventType.durationMinutes,
          bufferMinutes: eventType.bufferMinutes,
          maxPerDay: eventType.maxPerDay,
          questions: parseQuestions(eventType.intakeQuestions),
          assignmentMode: eventType.assignmentMode,
          poolMemberIds: pool.map((p) => p.teamMemberId),
          teamMembers,
          teamSchedulingEnabled,
        }}
      />
    </div>
  );
}
