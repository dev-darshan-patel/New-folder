import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateMemberAvailabilityAction } from "../../actions";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function toHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60).toString().padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

export default async function MemberAvailabilityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return null;

  const member = await prisma.teamMember.findFirst({ where: { id, userId: user.id } });
  if (!member) notFound();

  const windows = await prisma.availability.findMany({ where: { teamMemberId: id } });
  const byDay = new Map(windows.map((w) => [w.weekday, w]));

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">
        {member.name}&apos;s hours
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        Hours are in your business timezone ({user.timezone}).
      </p>

      <form action={updateMemberAvailabilityAction} className="mt-6 space-y-3">
        <input type="hidden" name="teamMemberId" value={id} />
        {DAYS.map((day, weekday) => {
          const w = byDay.get(weekday);
          const enabled = Boolean(w);
          return (
            <div
              key={weekday}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4"
            >
              <label className="flex w-32 items-center gap-2">
                <input
                  type="checkbox"
                  name={`enabled-${weekday}`}
                  defaultChecked={enabled}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                />
                <span className="text-sm font-medium text-slate-800">{day}</span>
              </label>
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="time"
                  name={`start-${weekday}`}
                  defaultValue={w ? toHHMM(w.startMinutes) : "09:00"}
                  className="rounded-lg border border-slate-300 px-2 py-1.5 text-slate-900 outline-none focus:border-indigo-500"
                />
                <span>to</span>
                <input
                  type="time"
                  name={`end-${weekday}`}
                  defaultValue={w ? toHHMM(w.endMinutes) : "17:00"}
                  className="rounded-lg border border-slate-300 px-2 py-1.5 text-slate-900 outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          );
        })}
        <button
          type="submit"
          className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500"
        >
          Save hours
        </button>
      </form>
    </div>
  );
}
