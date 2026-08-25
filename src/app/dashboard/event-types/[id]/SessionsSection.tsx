import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatPrice } from "@/lib/payments";
import { createSessionAction, cancelSessionAction } from "../../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";

type Pricing = { canPrice: true; currency: string } | { canPrice: false; reason: string };

// Owner-facing section that lists this group event type's sessions and lets
// the owner create/cancel them. Rendered from the event type editor page but
// intentionally under the main form, since the two forms are independent.
export default async function SessionsSection({
  eventTypeId,
  defaultCapacity,
  durationMinutes,
  businessTimezone,
  issuesTickets = false,
  pricing = { canPrice: false, reason: "" },
}: {
  eventTypeId: string;
  defaultCapacity: number;
  durationMinutes: number;
  businessTimezone: string;
  issuesTickets?: boolean;
  pricing?: Pricing;
}) {
  const now = new Date();
  const sessions = await prisma.session.findMany({
    where: { eventTypeId },
    orderBy: { startTime: "asc" },
    include: { tiers: { orderBy: { sortOrder: "asc" } } },
  });

  const upcoming = sessions.filter((s) => !s.cancelled && s.startTime >= now);
  const past = sessions.filter((s) => s.cancelled || s.startTime < now);

  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: businessTimezone,
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <section className="mt-10 border-t border-border pt-8">
      <h2 className="text-lg font-semibold text-foreground">Sessions</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Each session is one date/time invitees can book into ({durationMinutes} min,
        up to {defaultCapacity} attendees). All times shown in your timezone (
        {businessTimezone}).
      </p>

      <form
        action={createSessionAction}
        className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-slate-50 p-4"
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
        {issuesTickets && (
          <label className="flex items-center gap-2 pb-2 text-sm text-slate-700">
            <input type="checkbox" name="unlimited" value="1" className="h-4 w-4 rounded border-input" />
            Unlimited (ignore seat cap)
          </label>
        )}
        <SubmitButton>Add session</SubmitButton>

        {issuesTickets && (
          <div className="mt-2 w-full border-t border-border pt-3">
            <p className="text-xs font-medium text-slate-600">
              Ticket categories (optional — e.g. VIP, Premium, Normal). Leave capacity
              blank for unlimited within that category. Leave a row&rsquo;s name blank to
              skip it.
              {pricing.canPrice &&
                ` Set a price (in ${pricing.currency}) to charge for that category — leave it blank to keep it free.`}
            </p>
            <div className="mt-2 space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    name={`tierName${i}`}
                    placeholder={i === 0 ? "e.g. VIP" : "Category name"}
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    name={`tierCapacity${i}`}
                    min={1}
                    placeholder="Seats (blank = unlimited)"
                    className="w-52"
                  />
                  {pricing.canPrice && (
                    <Input
                      type="number"
                      name={`tierPrice${i}`}
                      min={1}
                      step="1"
                      placeholder={`Price in ${pricing.currency} cents (blank = free)`}
                      className="w-64"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </form>

      <div className="mt-6">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Upcoming
        </h3>
        {upcoming.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed border-input p-4 text-center text-sm text-muted-foreground">
            No upcoming sessions. Add one above.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {upcoming.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between rounded-lg border border-border bg-white p-3 text-sm"
              >
                <div>
                  <p className="font-medium text-foreground">{fmt.format(s.startTime)}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.tiers.length > 0
                      ? `${s.seatsTaken} tickets sold across ${s.tiers.length} categories`
                      : s.unlimited
                        ? `${s.seatsTaken} booked (unlimited)`
                        : `${s.seatsTaken} / ${s.capacity} booked`}
                    {s.meetingUrl && (
                      <>
                        {" · "}
                        <a
                          href={s.meetingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          {s.meetingProvider === "zoom" ? "Zoom link" : "Meet link"}
                        </a>
                      </>
                    )}
                  </p>
                  {s.tiers.length > 0 && (
                    <ul className="mt-1.5 flex flex-wrap gap-1.5">
                      {s.tiers.map((t) => (
                        <li
                          key={t.id}
                          className="rounded bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
                        >
                          {t.name}: {t.seatsTaken}
                          {t.capacity != null ? ` / ${t.capacity}` : " (unlimited)"}
                          {t.priceCents != null && pricing.canPrice
                            ? ` · ${formatPrice(t.priceCents, pricing.currency)}`
                            : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button asChild variant="link" size="sm">
                    <Link href={`/dashboard/event-types/${eventTypeId}/sessions/${s.id}`}>
                      Roster
                    </Link>
                  </Button>
                  <form action={cancelSessionAction}>
                    <input type="hidden" name="sessionId" value={s.id} />
                    <SubmitButton variant="link" size="sm" className="text-red-600">
                      Cancel
                    </SubmitButton>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {past.length > 0 && (
        <div className="mt-6 opacity-60">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Past &amp; canceled
          </h3>
          <ul className="mt-3 space-y-2">
            {past.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between rounded-lg border border-border bg-white p-3 text-sm"
              >
                <div>
                  <p className="font-medium text-slate-700">{fmt.format(s.startTime)}</p>
                  <p className="text-xs text-muted-foreground">
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
