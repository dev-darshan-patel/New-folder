"use client";

import { useEffect, useState, useTransition } from "react";
import { createGroupBookingAction, type BookingResult } from "../actions";
import type { IntakeQuestion } from "@/lib/intake";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";

// A group session as passed in from the server component.
export type GroupSession = {
  id: string;
  startUtc: string;
  seatsLeft: number;
};

// Format a UTC instant as a full "Fri, Jul 10 · 6:00 PM" label in the given tz.
function fmtSession(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export default function GroupBookingWidget({
  eventTypeId,
  timezone,
  accent = "#4f46e5",
  questions = [],
  sessions,
}: {
  eventTypeId: string;
  timezone: string;
  accent?: string;
  questions?: IntakeQuestion[];
  sessions: GroupSession[];
}) {
  const [selected, setSelected] = useState<GroupSession | null>(null);
  const [submitting, startSubmit] = useTransition();
  const [result, setResult] = useState<BookingResult | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Show times in the invitee's own zone once we detect it, falling back to
  // the business timezone for a stable SSR match.
  const [viewerTz, setViewerTz] = useState<string>(timezone);
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

  // If the event type has a confirmation redirect configured, send them straight
  // there instead of showing the built-in confirmation card.
  useEffect(() => {
    if (result?.ok && result.redirectUrl) {
      window.location.assign(result.redirectUrl);
    }
  }, [result]);

  if (result?.ok && result.redirectUrl) {
    return <p className="mt-10 text-center text-sm text-slate-500">Redirecting…</p>;
  }

  if (result?.ok) {
    return (
      <div className="mt-10 rounded-2xl border border-green-200 bg-green-50 p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-600 text-2xl text-white">
          ✓
        </div>
        <h2 className="mt-4 text-lg font-semibold text-slate-900">You&apos;re in!</h2>
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
          Cancel booking
        </a>
      </div>
    );
  }

  return (
    <div className="mt-6">
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

      {!selected ? (
        <>
          <h2 className="text-sm font-semibold text-slate-700">Upcoming sessions</h2>
          <div className="mt-3 space-y-2">
            {sessions.length === 0 && (
              <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                No sessions scheduled yet — please check back soon.
              </p>
            )}
            {sessions.map((s) => {
              const full = s.seatsLeft <= 0;
              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={full}
                  onClick={() => {
                    setSelected(s);
                    setFormError(null);
                  }}
                  style={full ? undefined : { color: accent }}
                  className={`flex w-full items-center justify-between rounded-lg border border-slate-200 px-4 py-3 text-sm font-medium transition-colors ${
                    full
                      ? "cursor-not-allowed opacity-60"
                      : "hover:border-slate-400 hover:bg-slate-50"
                  }`}
                >
                  <span>{fmtSession(s.startUtc, viewerTz)}</span>
                  <span className={`text-xs ${full ? "text-red-600" : "text-slate-500"}`}>
                    {full ? "Full" : `${s.seatsLeft} seat${s.seatsLeft === 1 ? "" : "s"} left`}
                  </span>
                </button>
              );
            })}
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
            startSubmit(async () => {
              const res = await createGroupBookingAction({
                eventTypeId,
                sessionId: selected.id,
                name: String(fd.get("name") || ""),
                email: String(fd.get("email") || ""),
                notes: String(fd.get("notes") || ""),
                viewerTimezone: viewerTz,
                answers,
              });
              if (res.ok) setResult(res);
              else setFormError(res.error);
            });
          }}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">
              Confirm {fmtSession(selected.startUtc, viewerTz)}
            </h2>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="text-xs font-medium text-slate-500 hover:text-slate-900"
            >
              ← Back
            </button>
          </div>
          <div className="mt-4 space-y-3">
            <Input name="name" required placeholder="Your name" />
            <Input name="email" type="email" required placeholder="Your email" />
            <Textarea
              name="notes"
              rows={2}
              placeholder="Anything we should know? (optional)"
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
  );
}
