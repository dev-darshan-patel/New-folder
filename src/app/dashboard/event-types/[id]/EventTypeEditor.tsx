"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { updateEventTypeAction } from "../../actions";
import type { IntakeQuestion } from "@/lib/intake";

type LocationType = "IN_PERSON" | "PHONE" | "GOOGLE_MEET";

type Initial = {
  id: string;
  title: string;
  description: string;
  durationMinutes: number;
  bufferMinutes: number;
  maxPerDay: number | null;
  questions: IntakeQuestion[];
  assignmentMode: "SOLO" | "ROUND_ROBIN" | "COLLECTIVE";
  poolMemberIds: string[];
  teamMembers: { id: string; name: string; isOwner: boolean }[];
  teamSchedulingEnabled: boolean;
  locationType: LocationType;
  locationDetail: string;
  calendarConnected: boolean;
};

export default function EventTypeEditor({ initial }: { initial: Initial }) {
  const [questions, setQuestions] = useState<IntakeQuestion[]>(initial.questions);
  const [mode, setMode] = useState(initial.assignmentMode);
  const [pool, setPool] = useState<string[]>(initial.poolMemberIds);
  const [location, setLocation] = useState<LocationType>(initial.locationType);
  const [locationDetail, setLocationDetail] = useState(initial.locationDetail);

  function togglePool(id: string) {
    setPool((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  function update(i: number, patch: Partial<IntakeQuestion>) {
    setQuestions((qs) => qs.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
  }
  function add() {
    setQuestions((qs) => [...qs, { label: "", required: false }]);
  }
  function remove(i: number) {
    setQuestions((qs) => qs.filter((_, idx) => idx !== i));
  }

  const cleaned = questions.filter((q) => q.label.trim() !== "");

  return (
    <form action={updateEventTypeAction} className="mt-6 space-y-6">
      <input type="hidden" name="id" value={initial.id} />
      <input type="hidden" name="intakeQuestions" value={JSON.stringify(cleaned)} />

      <Field label="Title">
        <input
          name="title"
          defaultValue={initial.title}
          required
          title="Event type title"
          placeholder="e.g. 30 Minute Meeting"
          className={input}
        />
      </Field>

      <Field label="Description (optional)">
        <textarea
          name="description"
          defaultValue={initial.description}
          rows={2}
          title="Event type description"
          placeholder="A short description shown to customers"
          className={input}
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Duration (minutes)">
          <select
            name="durationMinutes"
            defaultValue={String(initial.durationMinutes)}
            title="Meeting duration in minutes"
            className={input}
          >
            {[15, 30, 45, 60, 90, 120].map((d) => (
              <option key={d} value={d}>
                {d} min
              </option>
            ))}
          </select>
        </Field>

        <Field label="Minimum notice">
          <select
            name="bufferMinutes"
            defaultValue={String(initial.bufferMinutes)}
            title="Minimum notice required before a booking"
            className={input}
          >
            <option value="0">None</option>
            <option value="60">1 hour</option>
            <option value="120">2 hours</option>
            <option value="240">4 hours</option>
            <option value="720">12 hours</option>
            <option value="1440">1 day</option>
          </select>
        </Field>

        <Field label="Max bookings / day">
          <input
            name="maxPerDay"
            type="number"
            min={1}
            defaultValue={initial.maxPerDay ?? ""}
            placeholder="Unlimited"
            title="Maximum number of bookings allowed per day"
            className={input}
          />
        </Field>
      </div>

      <div>
        <p className="text-sm font-medium text-slate-700">Location</p>
        <p className="text-xs text-slate-500">Where this meeting takes place.</p>
        <input type="hidden" name="locationType" value={location} />
        <div className="mt-2 flex flex-wrap gap-2">
          {(
            [
              { v: "IN_PERSON", label: "In person" },
              { v: "PHONE", label: "Phone" },
              { v: "GOOGLE_MEET", label: "Google Meet" },
            ] as const
          ).map((opt) => {
            const disabled = opt.v === "GOOGLE_MEET" && !initial.calendarConnected;
            return (
              <button
                key={opt.v}
                type="button"
                disabled={disabled}
                onClick={() => setLocation(opt.v)}
                title={
                  disabled
                    ? "Connect Google Calendar in Settings to enable Google Meet"
                    : opt.label
                }
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
                  location === opt.v
                    ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                    : "border-slate-300 text-slate-700 hover:bg-slate-50"
                } ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {opt_google_hint(location, initial.calendarConnected)}

        {(location === "IN_PERSON" || location === "PHONE") && (
          <input
            name="locationDetail"
            value={locationDetail}
            onChange={(e) => setLocationDetail(e.target.value)}
            placeholder={
              location === "PHONE"
                ? "Phone number (shown to the invitee)"
                : "Address or room (shown to the invitee)"
            }
            title="Location detail"
            className={`${input} mt-3`}
          />
        )}
      </div>

      <div>
        <p className="text-sm font-medium text-slate-700">Intake questions</p>
        <p className="text-xs text-slate-500">
          Extra questions shown on the booking form (in addition to name &amp; email).
        </p>
        <div className="mt-3 space-y-2">
          {questions.map((q, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={q.label}
                onChange={(e) => update(i, { label: e.target.value })}
                placeholder="e.g. Phone number"
                title={`Intake question ${i + 1}`}
                className={`${input} flex-1`}
              />
              <label className="flex items-center gap-1 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={q.required}
                  onChange={(e) => update(i, { required: e.target.checked })}
                  title={`Make question ${i + 1} required`}
                  className="h-4 w-4 rounded border-slate-300"
                />
                Required
              </label>
              <button
                type="button"
                onClick={() => remove(i)}
                className="rounded-lg px-2 py-1 text-sm text-red-600 hover:bg-red-50"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={add}
          className="mt-2 text-sm font-medium text-indigo-600 hover:underline"
        >
          + Add question
        </button>
      </div>

      {initial.teamSchedulingEnabled && (
        <div>
          <p className="text-sm font-medium text-slate-700">Assignment</p>
          <p className="text-xs text-slate-500">
            Who handles bookings for this event type.
          </p>
          <input type="hidden" name="assignmentMode" value={mode} />
          <input type="hidden" name="poolMemberIds" value={JSON.stringify(pool)} />
          <div className="mt-2 flex gap-2">
            {(["SOLO", "ROUND_ROBIN", "COLLECTIVE"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
                  mode === m
                    ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                    : "border-slate-300 text-slate-700 hover:bg-slate-50"
                }`}
              >
                {m === "SOLO" ? "Solo" : m === "ROUND_ROBIN" ? "Round-robin" : "Collective"}
              </button>
            ))}
          </div>
          {mode !== "SOLO" && (
            <div className="mt-3 space-y-1">
              {initial.teamMembers.map((m) => (
                <label key={m.id} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={pool.includes(m.id)}
                    onChange={() => togglePool(m.id)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  {m.name}
                  {m.isOwner ? " (you)" : ""}
                </label>
              ))}
              {initial.teamMembers.length === 0 && (
                <p className="text-xs text-slate-400">
                  No active team members yet — add some on the Team page.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <SaveButton />
    </form>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Saving…" : "Save changes"}
    </button>
  );
}

function opt_google_hint(location: LocationType, connected: boolean) {
  if (location === "GOOGLE_MEET") {
    return (
      <p className="mt-2 text-xs text-slate-500">
        A unique Google Meet link is created for each booking and included in the
        confirmation email and calendar invite.
      </p>
    );
  }
  if (!connected) {
    return (
      <p className="mt-2 text-xs text-slate-400">
        Want a video link?{" "}
        <a href="/dashboard/settings" className="text-indigo-600 hover:underline">
          Connect Google Calendar
        </a>{" "}
        to enable Google Meet.
      </p>
    );
  }
  return null;
}

const input =
  "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}
