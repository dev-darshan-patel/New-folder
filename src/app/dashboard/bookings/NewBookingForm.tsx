"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { fetchManualSlotsAction, createManualBookingAction } from "./manual-actions";
import type { Slot } from "@/lib/availability";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { Card, CardContent } from "@/components/ui/card";

type EventTypeOption = { id: string; title: string; durationMinutes: number };

function fmtTime(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(
    new Date(iso),
  );
}

export default function NewBookingForm({
  eventTypes,
  timezone,
}: {
  eventTypes: EventTypeOption[];
  timezone: string;
}) {
  const router = useRouter();
  const [eventTypeId, setEventTypeId] = useState(eventTypes[0]?.id ?? "");
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [selected, setSelected] = useState<Slot | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [notify, setNotify] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingSlots, startLoadingSlots] = useTransition();
  const [submitting, startSubmit] = useTransition();

  const loadSlots = (nextDate: string) => {
    setDate(nextDate);
    setSelected(null);
    setSlots(null);
    if (!nextDate || !eventTypeId) return;
    startLoadingSlots(async () => {
      const result = await fetchManualSlotsAction(eventTypeId, nextDate);
      setSlots(result);
    });
  };

  if (eventTypes.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-slate-600">
          Manual booking currently supports solo event types only, and you don&apos;t have any yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Event type</label>
          <NativeSelect
            value={eventTypeId}
            onChange={(e) => {
              setEventTypeId(e.target.value);
              if (date) loadSlots(date);
            }}
          >
            {eventTypes.map((et) => (
              <option key={et.id} value={et.id}>
                {et.title} ({et.durationMinutes} min)
              </option>
            ))}
          </NativeSelect>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Date</label>
          <Input type="date" value={date} onChange={(e) => loadSlots(e.target.value)} className="w-auto" />
        </div>

        {date && (
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Time</label>
            {loadingSlots ? (
              <p className="text-sm text-slate-400">Loading times…</p>
            ) : slots && slots.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {slots.map((s) => (
                  <Button
                    key={s.startUtc}
                    type="button"
                    variant={selected?.startUtc === s.startUtc ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelected(s)}
                  >
                    {fmtTime(s.startUtc, timezone)}
                  </Button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">No open times that day.</p>
            )}
          </div>
        )}

        {selected && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Customer name</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Customer email</label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Notes (optional)</label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={notify}
                onChange={(e) => setNotify(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-ring"
              />
              Email the customer a confirmation
            </label>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <Button
              type="button"
              disabled={submitting || !name.trim() || !email.trim()}
              onClick={() => {
                setError(null);
                startSubmit(async () => {
                  const result = await createManualBookingAction({
                    eventTypeId,
                    startUtc: selected.startUtc,
                    name,
                    email,
                    notes,
                    notifyInvitee: notify,
                  });
                  if (result.ok) {
                    toast.success("Booking created.");
                    router.push("/dashboard/bookings");
                  } else {
                    setError(result.error);
                  }
                });
              }}
            >
              {submitting ? "Creating…" : "Create booking"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
