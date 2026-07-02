"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { buildDays } from "@/lib/days";
import type { Slot } from "@/lib/availability";
import {
  fetchRescheduleSlots,
  rescheduleBookingAction,
  type RescheduleResult,
} from "../actions";
import { Button } from "@/components/ui/button";

export default function RescheduleWidget({
  token,
  timezone,
}: {
  token: string;
  timezone: string;
}) {
  const days = useMemo(() => buildDays(timezone, 14), [timezone]);
  const [selectedDay, setSelectedDay] = useState<string>(days[0]?.iso ?? "");
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [loading, startLoading] = useTransition();
  const [submitting, startSubmit] = useTransition();
  const [result, setResult] = useState<RescheduleResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedDay) return;
    let active = true;
    startLoading(async () => {
      const s = await fetchRescheduleSlots(token, selectedDay);
      if (active) setSlots(s);
    });
    return () => {
      active = false;
    };
  }, [selectedDay, token]);

  function pick(slot: Slot) {
    setError(null);
    startSubmit(async () => {
      const res = await rescheduleBookingAction({ token, startUtc: slot.startUtc });
      if (res.ok) setResult(res);
      else setError(res.error);
    });
  }

  if (result?.ok) {
    return (
      <div className="mt-10 rounded-2xl border border-green-200 bg-green-50 p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-600 text-2xl text-white">
          ✓
        </div>
        <h2 className="mt-4 text-lg font-semibold text-slate-900">Rescheduled!</h2>
        <p className="mt-1 text-sm text-slate-600">{result.when}</p>
        <Link
          href={`/booking/${token}`}
          className="mt-4 inline-block text-sm font-medium text-indigo-600 hover:underline"
        >
          View booking
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-6 grid gap-8 sm:grid-cols-[1fr_1.2fr]">
      <div>
        <h2 className="text-sm font-semibold text-slate-700">Select a date</h2>
        <div className="mt-3 grid max-h-80 grid-cols-2 gap-2 overflow-y-auto pr-1">
          {days.map((day) => (
            <button
              key={day.iso}
              type="button"
              onClick={() => setSelectedDay(day.iso)}
              className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                selectedDay === day.iso
                  ? "border-indigo-600 bg-indigo-600 text-white"
                  : "border-slate-200 text-slate-700 hover:border-indigo-300"
              }`}
            >
              {day.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-slate-700">New times</h2>
        {error && (
          <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="mt-3 space-y-2">
          {(loading || slots === null) && (
            <p className="text-sm text-slate-400">Loading times…</p>
          )}
          {!loading && slots !== null && slots.length === 0 && (
            <p className="text-sm text-slate-400">No times available on this day.</p>
          )}
          {!loading &&
            slots !== null &&
            slots.map((slot) => (
              <Button
                key={slot.startUtc}
                type="button"
                disabled={submitting}
                onClick={() => pick(slot)}
                variant="outline"
                className="w-full justify-center text-indigo-700 hover:border-indigo-500 hover:bg-indigo-50"
              >
                {slot.label}
              </Button>
            ))}
        </div>
      </div>
    </div>
  );
}
