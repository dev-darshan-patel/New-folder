import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { createSessionAction, cancelSessionAction } from "../../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Owner-facing section that lists this group event type's sessions and lets
// the owner create/cancel them. Rendered from the event type editor page but
// intentionally under the main form, since the two forms are independent.
export default async function SessionsSection({
  eventTypeId,
  defaultCapacity,
  durationMinutes,
  businessTimezone,
}: {
  eventTypeId: string;
  defaultCapacity: number;
  durationMinutes: number;
  businessTimezone: string;
}) {
  const now = new Date();
  const sessions = await prisma.session.findMany({
    where: { eventTypeId },
    orderBy: { startTime: "asc" },
  });

  const upcoming = sessions.filter((s) => !s.cancelled && s.startTime >= now);
  const past = sessions.filter((s) => s.cancelled || s.startTime < now);

  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: businessTimezone,
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <section className="mt-10 border-t border-slate-200 pt-8">
      <h2 className="text-lg font-semibold text-slate-900">Sessions</h2>
      <p className="mt-1 text-sm text-slate-500">
        Each session is one date/time invitees can book into ({durationMinutes} min,
        up to {defaultCapacity} attendees). All times shown in your timezone (
        {businessTimezone}).
      </p>

      <form
        action={createSessionAction}
        className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4"
      >
        <input type="hidden" name="eventTypeId" value={eventTypeId} />
        <label className="block">
          <span className="text-xs font-medium text-slate-600">Date &amp; time</span>
          <Input type="datetime-local" name="startLocal" required className="mt-1" />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-600">Seats</span>
          <Input
            type="number"
            name="capacity"
            min={1}
            defaultValue={defaultCapacity}
            className="mt-1 w-24"
          />
        </label>
        <Button type="submit">Add session</Button>
      </form>

      <div className="mt-6">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Upcoming
        </h3>
        {upcoming.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">
            No upcoming sessions. Add one above.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {upcoming.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3 text-sm"
              >
                <div>
                  <p className="font-medium text-slate-900">{fmt.format(s.startTime)}</p>
                  <p className="text-xs text-slate-500">
                    {s.seatsTaken} / {s.capacity} booked
                    {s.meetingUrl && (
                      <>
                        {" · "}
                        <a
                          href={s.meetingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-600 hover:underline"
                        >
                          {s.meetingProvider === "zoom" ? "Zoom link" : "Meet link"}
                        </a>
                      </>
                    )}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button asChild variant="link" size="sm">
                    <Link href={`/dashboard/event-types/${eventTypeId}/sessions/${s.id}`}>
                      Roster
                    </Link>
                  </Button>
                  <form action={cancelSessionAction}>
                    <input type="hidden" name="sessionId" value={s.id} />
                    <Button type="submit" variant="link" size="sm" className="text-red-600">
                      Cancel
                    </Button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {past.length > 0 && (
        <div className="mt-6 opacity-60">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Past &amp; canceled
          </h3>
          <ul className="mt-3 space-y-2">
            {past.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3 text-sm"
              >
                <div>
                  <p className="font-medium text-slate-700">{fmt.format(s.startTime)}</p>
                  <p className="text-xs text-slate-500">
                    {s.cancelled ? "Canceled" : `${s.seatsTaken} / ${s.capacity} attended`}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
