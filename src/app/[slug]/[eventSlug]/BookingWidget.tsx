"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  fetchSlotsAction,
  createBookingAction,
  type BookingResult,
} from "../actions";
import type { Slot } from "@/lib/availability";
import { buildDays } from "@/lib/days";
import type { IntakeQuestion } from "@/lib/intake";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";

// Format a UTC instant as a time label in the given timezone.
function fmtTime(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export default function BookingWidget({
  eventTypeId,
  timezone,
  accent = "#4f46e5",
  questions = [],
}: {
  eventTypeId: string;
  timezone: string;
  accent?: string;
  questions?: IntakeQuestion[];
}) {
  // Build extra days so filtering past dates (per viewer tz) still leaves 14.
  const allDays = useMemo(() => buildDays(timezone, 21), [timezone]);

  // null = not yet loaded (show loading), [] = loaded but no availability.
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [loading, startLoading] = useTransition();
  const [submitting, startSubmit] = useTransition();
  const [result, setResult] = useState<BookingResult | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Times are shown in the invitee's timezone. Default to the business timezone
  // for deterministic SSR, then switch to the visitor's detected zone on mount.
  const [viewerTz, setViewerTz] = useState<string>(timezone);
  // The full IANA zone list also must NOT be computed during render: Node's
  // ICU data (used for SSR) can differ from the browser's, which would make
  // the server-rendered <option> list disagree with what hydration computes
  // and throw a hydration-mismatch error. Start with just the business
  // timezone (identical on server and first client render) and fill in the
  // full list client-side after mount, same pattern as viewerTz below.
  const [timezones, setTimezones] = useState<string[]>([timezone]);

  useEffect(() => {
    try {
      const sv = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] })
        .supportedValuesOf;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (sv) setTimezones(sv("timeZone"));
    } catch {
      /* not supported; keep the single-zone fallback */
    }
  }, []);

  useEffect(() => {
    let detected: string | null = null;
    try {
      detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (detected) setViewerTz(detected);
  }, []);

  // Filter out dates already past in the viewer's timezone, then cap at 14.
  const days = useMemo(() => {
    const todayInViewer = new Intl.DateTimeFormat("en-CA", { timeZone: viewerTz }).format(new Date());
    return allDays.filter((d) => d.iso >= todayInViewer).slice(0, 14);
  }, [allDays, viewerTz]);

  const [selectedDay, setSelectedDay] = useState<string>(days[0]?.iso ?? "");

  // Load slots whenever the selected day changes. State is only set from the
  // async callback to avoid synchronous setState within the effect.
  useEffect(() => {
    if (!selectedDay) return;
    let active = true;
    startLoading(async () => {
      const s = await fetchSlotsAction(eventTypeId, selectedDay);
      if (active) setSlots(s);
    });
    return () => {
      active = false;
    };
  }, [selectedDay, eventTypeId]);

  function selectDay(iso: string) {
    setSelectedDay(iso);
    setSelectedSlot(null);
  }

  // If the event type has a confirmation redirect configured, send the
  // invitee straight there instead of showing the built-in confirmation card.
  useEffect(() => {
    if (result?.ok && result.redirectUrl) {
      window.location.assign(result.redirectUrl);
    }
  }, [result]);

  if (result?.ok && result.redirectUrl) {
    return (
      <p className="mt-10 text-center text-sm text-slate-500">Redirecting…</p>
    );
  }

  if (result?.ok && result.pending) {
    return (
      <div className="mt-10 rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-500 text-2xl text-white">
          ⏳
        </div>
        <h2 className="mt-4 text-lg font-semibold text-slate-900">
          Request received
        </h2>
        <p className="mt-1 text-sm text-slate-600">{result.when}</p>
        <p className="mt-3 text-sm text-slate-500">
          This booking isn&apos;t confirmed yet — we&apos;ll email you once it&apos;s approved.
        </p>
        <a
          href={result.manageUrl}
          style={{ color: accent }}
          className="mt-4 inline-block text-sm font-medium hover:underline"
        >
          View request
        </a>
      </div>
    );
  }

  if (result?.ok) {
    return (
      <div className="mt-10 rounded-2xl border border-green-200 bg-green-50 p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-600 text-2xl text-white">
          ✓
        </div>
        <h2 className="mt-4 text-lg font-semibold text-slate-900">
          You&apos;re booked!
        </h2>
        <p className="mt-1 text-sm text-slate-600">{result.when}</p>
        {result.meetingUrl && (
          <a
            href={result.meetingUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ backgroundColor: accent }}
            className="mt-4 inline-block rounded-lg px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"
          >
            {result.meetingProvider === "zoom" ? "Join Zoom Meeting" : "Join Google Meet"}
          </a>
        )}
        <p className="mt-3 text-sm text-slate-500">
          A confirmation has been sent to your email.
        </p>
        <a
          href={result.manageUrl}
          style={{ color: accent }}
          className="mt-4 inline-block text-sm font-medium hover:underline"
        >
          Reschedule or cancel
        </a>
      </div>
    );
  }

  return (
    <div className="mt-6">
      {/* Invitee timezone selector */}
      <div className="mb-5 flex flex-wrap items-center gap-2 text-sm text-slate-600">
        <span>Times shown in</span>
        <NativeSelect
          value={viewerTz}
          onChange={(e) => setViewerTz(e.target.value)}
          className="w-auto"
        >
          {timezones.map((tz) => (
            <option key={tz} value={tz}>
              {tz.replace(/_/g, " ")}
            </option>
          ))}
        </NativeSelect>
      </div>

      <div className="grid gap-8 sm:grid-cols-[1fr_1.2fr]">
      {/* Date picker */}
      <div>
        <h2 className="text-sm font-semibold text-slate-700">Select a date</h2>
        <div className="mt-3 grid max-h-80 grid-cols-2 gap-2 overflow-y-auto pr-1">
          {days.map((day) => (
            <button
              key={day.iso}
              type="button"
              onClick={() => selectDay(day.iso)}
              style={
                selectedDay === day.iso
                  ? { backgroundColor: accent, borderColor: accent }
                  : undefined
              }
              className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                selectedDay === day.iso
                  ? "text-white"
                  : "border-slate-200 text-slate-700 hover:border-slate-300"
              }`}
            >
              {day.label}
            </button>
          ))}
        </div>
      </div>

      {/* Slots / form */}
      <div>
        {!selectedSlot ? (
          <>
            <h2 className="text-sm font-semibold text-slate-700">
              Available times
            </h2>
            <div className="mt-3 space-y-2">
              {(loading || slots === null) && (
                <p className="text-sm text-slate-400">Loading times…</p>
              )}
              {!loading && slots !== null && slots.length === 0 && (
                <p className="text-sm text-slate-400">
                  No times available on this day.
                </p>
              )}
              {!loading &&
                slots !== null &&
                slots.map((slot) => (
                  <button
                    key={slot.startUtc}
                    type="button"
                    style={{ color: accent }}
                    onClick={() => {
                      setSelectedSlot(slot);
                      setFormError(null);
                    }}
                    className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium transition-colors hover:border-slate-400 hover:bg-slate-50"
                  >
                    {fmtTime(slot.startUtc, viewerTz)}
                  </button>
                ))}
            </div>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              setFormError(null);
              const answers = questions.map((q, i) => ({
                label: q.label,
                value: String(fd.get(`q-${i}`) || ""),
              }));
              const guests = String(fd.get("guests") || "")
                .split(/[\n,]/)
                .map((line) => line.trim())
                .filter(Boolean)
                .map((line) => {
                  const match = line.match(/^(.*)<(.+)>$/);
                  return match
                    ? { name: match[1].trim() || undefined, email: match[2].trim() }
                    : { email: line };
                });
              startSubmit(async () => {
                const res = await createBookingAction({
                  eventTypeId,
                  startUtc: selectedSlot.startUtc,
                  name: String(fd.get("name") || ""),
                  email: String(fd.get("email") || ""),
                  notes: String(fd.get("notes") || ""),
                  viewerTimezone: viewerTz,
                  answers,
                  guests,
                });
                if (res.ok) setResult(res);
                else setFormError(res.error);
              });
            }}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700">
                Confirm {fmtTime(selectedSlot.startUtc, viewerTz)}
              </h2>
              <button
                type="button"
                onClick={() => setSelectedSlot(null)}
                className="text-xs font-medium text-slate-500 hover:text-slate-900"
              >
                ← Back
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <Input
                name="name"
                required
                placeholder="Your name"
              />
              <Input
                name="email"
                type="email"
                required
                placeholder="Your email"
              />
              <Textarea
                name="notes"
                rows={2}
                placeholder="Anything we should know? (optional)"
              />
              <Textarea
                name="guests"
                rows={2}
                placeholder="Add guests? One email per line (optional)"
              />
              {questions.map((q, i) => (
                <Input
                  key={i}
                  name={`q-${i}`}
                  required={q.required}
                  placeholder={q.required ? `${q.label} *` : `${q.label} (optional)`}
                />
              ))}
              {formError && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  {formError}
                </p>
              )}
              <Button
                type="submit"
                disabled={submitting}
                style={{ backgroundColor: accent }}
                className="w-full"
              >
                {submitting ? "Booking…" : "Confirm booking"}
              </Button>
            </div>
          </form>
        )}
      </div>
      </div>
    </div>
  );
}
