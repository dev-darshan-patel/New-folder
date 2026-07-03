"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { updateEventTypeAction } from "../../actions";
import type { IntakeQuestion } from "@/lib/intake";

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
};

export default function EventTypeEditor({ initial }: { initial: Initial }) {
  const [questions, setQuestions] = useState<IntakeQuestion[]>(initial.questions);
  const [mode, setMode] = useState(initial.assignmentMode);
  const [pool, setPool] = useState<string[]>(initial.poolMemberIds);

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
          className={input}
        />
      </Field>

      <Field label="Description (optional)">
        <textarea
          name="description"
          defaultValue={initial.description}
          rows={2}
          className={input}
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Duration (minutes)">
          <select
            name="durationMinutes"
            defaultValue={String(initial.durationMinutes)}
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
            className={input}
          />
        </Field>
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
                className={`${input} flex-1`}
              />
              <label className="flex items-center gap-1 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={q.required}
                  onChange={(e) => update(i, { required: e.target.checked })}
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
