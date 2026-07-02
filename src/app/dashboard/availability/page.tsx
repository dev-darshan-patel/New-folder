import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { saveAvailabilityAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function toHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

export default async function AvailabilityPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const windows = await prisma.availability.findMany({
    where: { userId: user.id },
  });
  // Map weekday -> first window (MVP supports one window per day).
  const byDay = new Map(windows.map((w) => [w.weekday, w]));

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">
        Availability
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        Set the hours you&apos;re available each week. Times are in your timezone
        ({user.timezone}).
      </p>

      <form action={saveAvailabilityAction} className="mt-6 space-y-3">
        {DAYS.map((day, weekday) => {
          const w = byDay.get(weekday);
          const enabled = Boolean(w);
          return (
            <Card key={weekday} className="mb-3">
              <CardContent className="flex flex-wrap items-center gap-3 p-4">
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
                  <Input
                    type="time"
                    name={`start-${weekday}`}
                    defaultValue={w ? toHHMM(w.startMinutes) : "09:00"}
                    className="w-auto"
                  />
                  <span>to</span>
                  <Input
                    type="time"
                    name={`end-${weekday}`}
                    defaultValue={w ? toHHMM(w.endMinutes) : "17:00"}
                    className="w-auto"
                  />
                </div>
              </CardContent>
            </Card>
          );
        })}

        <Button
          type="submit"
          className="mt-6"
        >
          Save availability
        </Button>
      </form>
    </div>
  );
}
