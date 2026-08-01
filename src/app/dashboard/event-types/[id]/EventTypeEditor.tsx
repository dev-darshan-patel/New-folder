"use client";

import Link from "next/link";
import { useState } from "react";
import { updateEventTypeAction } from "../../actions";
import type { IntakeQuestion } from "@/lib/intake";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { SubmitButton } from "@/components/ui/submit-button";

type LocationType = "IN_PERSON" | "PHONE" | "GOOGLE_MEET" | "ZOOM";

type Initial = {
  id: string;
  title: string;
  description: string;
  durationMinutes: number;
  bufferMinutes: number;
  maxPerDay: number | null;
  maxPerWeek: number | null;
  maxPerMonth: number | null;
  minNoticeToCancelMinutes: number;
  paddingMinutes: number;
  maxAdvanceDays: number | null;
  confirmationRedirectUrl: string;
  replyToEmail: string;
  requiresApproval: boolean;
  unlisted: boolean;
  capacity: number | null;
  allowRecurring: boolean;
  questions: IntakeQuestion[];
  assignmentMode: "SOLO" | "ROUND_ROBIN" | "COLLECTIVE";
  poolMemberIds: string[];
  teamMembers: { id: string; name: string; isOwner: boolean }[];
  teamSchedulingEnabled: boolean;
  locationType: LocationType;
  locationDetail: string;
  calendarConnected: boolean;
  zoomConnected: boolean;
  // Paid bookings (Feature 4.4). null = free.
  priceCents: number | null;
  currency: string | null;
  // Whether the tenant is currently allowed to set a paid price. Hidden reason
  // shown to explain the disabled state (e.g. finish onboarding first).
  pricing: { canPrice: true; currency: string } | { canPrice: false; reason: string };
  // Plan feature gates (src/lib/features.ts). Hiding gated fields here is a
  // courtesy layer only — updateEventTypeAction drops them server-side
  // regardless of what a forged request submits.
  features: {
    intakeQuestions: boolean;
    schedulingLimits: boolean;
    videoLinks: boolean;
    approvalFlow: boolean;
    redirectReplyTo: boolean;
    groupBookings: boolean;
    recurringBookings: boolean;
  };
};

export default function EventTypeEditor({ initial }: { initial: Initial }) {
  const [questions, setQuestions] = useState<IntakeQuestion[]>(initial.questions);
  const [mode, setMode] = useState(initial.assignmentMode);
  const [pool, setPool] = useState<string[]>(initial.poolMemberIds);
  const [location, setLocation] = useState<LocationType>(initial.locationType);
  const [locationDetail, setLocationDetail] = useState(initial.locationDetail);
  const [isGroup, setIsGroup] = useState(initial.capacity != null);
  const [capacity, setCapacity] = useState<string>(
    initial.capacity != null ? String(initial.capacity) : "10",
  );
  // Group and recurring are mutually exclusive — a group event uses manually
  // created sessions, a recurring event repeats a 1:1 slot weekly.
  const [allowRecurring, setAllowRecurring] = useState(initial.allowRecurring);

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

      <Section title="Basics" description="What this appointment is called and how long it runs.">
        <Field label="Title">
          <Input
            name="title"
            defaultValue={initial.title}
            required
            title="Event type title"
            placeholder="e.g. 30 Minute Meeting"
          />
        </Field>

        <Field label="Description (optional)">
          <Textarea
            name="description"
            defaultValue={initial.description}
            rows={2}
            title="Event type description"
            placeholder="A short description shown to customers"
          />
        </Field>
      </Section>

      <Section
        title="Scheduling"
        description="How long it takes, how far ahead people can book, and how many you'll accept."
      >
      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Duration (minutes)">
          <NativeSelect
            name="durationMinutes"
            defaultValue={String(initial.durationMinutes)}
            title="Meeting duration in minutes"
          >
            {[15, 30, 45, 60, 90, 120].map((d) => (
              <option key={d} value={d}>
                {d} min
              </option>
            ))}
          </NativeSelect>
        </Field>

        {initial.features.schedulingLimits && (
          <>
            <Field label="Minimum notice">
              <NativeSelect
                name="bufferMinutes"
                defaultValue={String(initial.bufferMinutes)}
                title="Minimum notice required before a booking"
              >
                <option value="0">None</option>
                <option value="60">1 hour</option>
                <option value="120">2 hours</option>
                <option value="240">4 hours</option>
                <option value="720">12 hours</option>
                <option value="1440">1 day</option>
              </NativeSelect>
            </Field>

            <Field label="Max bookings / day">
              <Input
                name="maxPerDay"
                type="number"
                min={1}
                defaultValue={initial.maxPerDay ?? ""}
                placeholder="Unlimited"
                title="Maximum number of bookings allowed per day"
              />
            </Field>

            <Field label="Max bookings / week">
              <Input
                name="maxPerWeek"
                type="number"
                min={1}
                defaultValue={initial.maxPerWeek ?? ""}
                placeholder="Unlimited"
                title="Maximum number of bookings allowed per calendar week"
              />
            </Field>

            <Field label="Max bookings / month">
              <Input
                name="maxPerMonth"
                type="number"
                min={1}
                defaultValue={initial.maxPerMonth ?? ""}
                placeholder="Unlimited"
                title="Maximum number of bookings allowed per calendar month"
              />
            </Field>

            <Field label="Cancel/reschedule notice">
              <NativeSelect
                name="minNoticeToCancelMinutes"
                defaultValue={String(initial.minNoticeToCancelMinutes)}
                title="Minimum notice required for an invitee to cancel or reschedule"
              >
                <option value="0">None</option>
                <option value="60">1 hour</option>
                <option value="120">2 hours</option>
                <option value="240">4 hours</option>
                <option value="720">12 hours</option>
                <option value="1440">1 day</option>
              </NativeSelect>
            </Field>

            <Field label="Buffer between meetings">
              <NativeSelect
                name="paddingMinutes"
                defaultValue={String(initial.paddingMinutes)}
                title="Gap enforced before and after every booking of this type"
              >
                <option value="0">None</option>
                <option value="5">5 minutes</option>
                <option value="10">10 minutes</option>
                <option value="15">15 minutes</option>
                <option value="30">30 minutes</option>
                <option value="60">1 hour</option>
              </NativeSelect>
            </Field>

            <Field label="Booking window (days ahead)">
              <Input
                name="maxAdvanceDays"
                type="number"
                min={1}
                defaultValue={initial.maxAdvanceDays ?? ""}
                placeholder="Unlimited"
                title="How many days ahead an invitee may book"
              />
            </Field>
          </>
        )}
      </div>
      {!initial.features.schedulingLimits && (
        <UpgradeNote text="Scheduling limits (minimum notice, booking caps, cancel-notice window) require a higher plan." />
      )}
      </Section>

      <Section title="Price" description="Charge for this appointment at the time of booking.">
        <PriceField
          priceCents={initial.priceCents}
          currency={initial.currency}
          pricing={initial.pricing}
          isGroup={isGroup}
          allowRecurring={allowRecurring}
          mode={mode}
        />
      </Section>

      <Section
        title="After booking"
        description="What happens once someone books, and who can find this event type."
      >
      {initial.features.redirectReplyTo ? (
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Confirmation redirect URL (optional)">
            <Input
              name="confirmationRedirectUrl"
              type="url"
              defaultValue={initial.confirmationRedirectUrl}
              placeholder="https://example.com/thank-you"
              title="Send invitees here instead of the built-in confirmation screen"
            />
          </Field>

          <Field label="Reply-to email (optional)">
            <Input
              name="replyToEmail"
              type="email"
              defaultValue={initial.replyToEmail}
              placeholder="support@yourbusiness.com"
              title="Replies to invitee emails go to this address instead of the default"
            />
          </Field>
        </div>
      ) : (
        <UpgradeNote text="Custom confirmation redirect and reply-to address require a higher plan." />
      )}

      {initial.features.approvalFlow ? (
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name="requiresApproval"
            value="1"
            defaultChecked={initial.requiresApproval}
            className="mt-0.5 h-4 w-4 rounded border-input"
          />
          <span>
            Require manual approval
            <span className="block text-xs text-muted-foreground">
              New bookings wait for you to approve or decline before they&apos;re confirmed.
            </span>
          </span>
        </label>
      ) : (
        <UpgradeNote text="Manual approval requires a higher plan." />
      )}

      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          name="unlisted"
          value="1"
          defaultChecked={initial.unlisted}
          className="mt-0.5 h-4 w-4 rounded border-input"
        />
        <span>
          Unlisted
          <span className="block text-xs text-muted-foreground">
            Hidden from your public booking page, but still bookable via its direct link.
          </span>
        </span>
      </label>
      </Section>

      <Section
        title="Booking type"
        description="One-to-one by default. Switch to a group class or a repeating weekly series."
      >
      {initial.features.groupBookings && (
        <div className="rounded-lg border border-border bg-slate-50 p-4">
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={isGroup}
              onChange={(e) => setIsGroup(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-input"
            />
            <span>
              Group event (multiple attendees per session)
              <span className="block text-xs text-muted-foreground">
                Instead of showing time slots from your weekly availability, you create each
                class/session manually and invitees book into a shared spot up to the seat
                limit. Ideal for classes, webinars, and workshops.
              </span>
            </span>
          </label>
          {isGroup && (
            <div className="mt-3 pl-6">
              <Field label="Seats per session">
                <Input
                  type="number"
                  min={1}
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                  title="Default seat count for new sessions of this event type"
                />
              </Field>
            </div>
          )}
          {/* Only send `capacity` in the form payload when the group toggle is on;
              otherwise it stays null in the DB and the classic 1:1 flow runs. */}
          {isGroup && <input type="hidden" name="capacity" value={capacity} />}
        </div>
      )}

      {initial.features.recurringBookings && !isGroup && (
        <div className="rounded-lg border border-border bg-slate-50 p-4">
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              name="allowRecurring"
              value="1"
              checked={allowRecurring}
              onChange={(e) => setAllowRecurring(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-input"
            />
            <span>
              Allow recurring bookings
              <span className="block text-xs text-muted-foreground">
                Invitees can book this as a weekly series (same weekday &amp; time, up to 8
                sessions). Only for solo, non-group event types.
              </span>
            </span>
          </label>
        </div>
      )}

      {(!initial.features.groupBookings || !initial.features.recurringBookings) && (
        <UpgradeNote
          text={
            !initial.features.groupBookings && !initial.features.recurringBookings
              ? "Group sessions and recurring bookings require a higher plan."
              : !initial.features.groupBookings
                ? "Group sessions require a higher plan."
                : "Recurring bookings require a higher plan."
          }
        />
      )}

      </Section>

      <Section title="Location" description="Where this meeting takes place.">
      <div>
        <input type="hidden" name="locationType" value={location} />
        <div className="mt-2 flex flex-wrap gap-2">
          {(
            [
              { v: "IN_PERSON", label: "In person" },
              { v: "PHONE", label: "Phone" },
              { v: "GOOGLE_MEET", label: "Google Meet" },
              { v: "ZOOM", label: "Zoom" },
            ] as const
          ).map((opt) => {
            const isVideo = opt.v === "GOOGLE_MEET" || opt.v === "ZOOM";
            const disabled =
              (isVideo && !initial.features.videoLinks) ||
              (opt.v === "GOOGLE_MEET" && !initial.calendarConnected) ||
              (opt.v === "ZOOM" && !initial.zoomConnected);
            return (
              <button
                key={opt.v}
                type="button"
                disabled={disabled}
                onClick={() => setLocation(opt.v)}
                title={
                  isVideo && !initial.features.videoLinks
                    ? "Auto video links require a higher plan"
                    : disabled
                      ? `Connect ${opt.v === "GOOGLE_MEET" ? "Google Calendar" : "Zoom"} in Settings to enable ${opt.label}`
                      : opt.label
                }
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
                  location === opt.v
                    ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                    : "border-input text-slate-700 hover:bg-slate-50"
                } ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {locationHint(location, initial.calendarConnected, initial.zoomConnected)}

        {(location === "IN_PERSON" || location === "PHONE") && (
          <Input
            name="locationDetail"
            value={locationDetail}
            onChange={(e) => setLocationDetail(e.target.value)}
            placeholder={
              location === "PHONE"
                ? "Phone number (shown to the invitee)"
                : "Address or room (shown to the invitee)"
            }
            title="Location detail"
            className="mt-3"
          />
        )}
      </div>
      </Section>

      <Section
        title="Intake questions"
        description="Extra questions shown on the booking form, in addition to name and email."
      >
      {initial.features.intakeQuestions ? (
        <div>
          <div className="space-y-2">
            {questions.map((q, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={q.label}
                  onChange={(e) => update(i, { label: e.target.value })}
                  placeholder="e.g. Phone number"
                  title={`Intake question ${i + 1}`}
                  className="flex-1"
                />
                <label className="flex items-center gap-1 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={q.required}
                    onChange={(e) => update(i, { required: e.target.checked })}
                    title={`Make question ${i + 1} required`}
                    className="h-4 w-4 rounded border-input"
                  />
                  Required
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => remove(i)}
                  className="text-red-600 hover:bg-red-50 hover:text-red-600"
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={add}
            className="mt-2 h-auto p-0"
          >
            + Add question
          </Button>
        </div>
      ) : (
        <UpgradeNote text="Custom intake questions require a higher plan." />
      )}
      </Section>

      {initial.teamSchedulingEnabled && (
      <Section title="Assignment" description="Who handles bookings for this event type.">
        <div>
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
                    : "border-input text-slate-700 hover:bg-slate-50"
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
                    className="h-4 w-4 rounded border-input"
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
      </Section>
      )}

      <SubmitButton pendingLabel="Saving…">Save changes</SubmitButton>
    </form>
  );
}

function locationHint(location: LocationType, calendarConnected: boolean, zoomConnected: boolean) {
  if (location === "GOOGLE_MEET" || location === "ZOOM") {
    return (
      <p className="mt-2 text-xs text-muted-foreground">
        A unique {location === "GOOGLE_MEET" ? "Google Meet" : "Zoom"} link is created
        for each booking and included in the confirmation email and calendar invite.
      </p>
    );
  }
  if (!calendarConnected || !zoomConnected) {
    return (
      <p className="mt-2 text-xs text-slate-400">
        Want a video link?{" "}
        <Link href="/dashboard/settings" className="text-primary hover:underline">
          Connect {!calendarConnected && !zoomConnected ? "Google Calendar or Zoom" : !calendarConnected ? "Google Calendar" : "Zoom"}
        </Link>{" "}
        to enable it.
      </p>
    );
  }
  return null;
}

// Small inline note shown in place of a gated section — consistent, low-key
// upgrade prompt reused across every plan-gated field in this form.
function UpgradeNote({ text }: { text: string }) {
  return (
    <p className="rounded-lg border border-dashed border-border bg-slate-50 px-3 py-2 text-xs text-muted-foreground">
      {text}{" "}
      <Link href="/dashboard/billing" className="font-medium text-primary hover:underline">
        See plans
      </Link>
    </p>
  );
}

// One titled group of related settings. This form carries ~20 settings and
// used to be a single flat column, with plan-gated upsell notes interleaved
// between real fields — grouping them makes it scannable and gives the
// upgrade prompts somewhere to sit that isn't the middle of a field list.
function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {description && (
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      )}
      <div className="mt-4 space-y-5">{children}</div>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Label className="block">
      <span className="mb-1 block">{label}</span>
      {children}
    </Label>
  );
}

// Price input for Feature 4.4. Renders nothing when the event type is a group
// or recurring type (the v1 scope fence — paid bookings only apply to single
// SOLO bookings). When rendered, shows either a working input paired with the
// tenant's active-provider currency, or a disabled explanation when the
// tenant isn't yet approved+onboarded. Priced in cents to match how the
// DB stores it — one place (the value) doubles as the initial + edit state.
function PriceField({
  priceCents,
  currency,
  pricing,
  isGroup,
  allowRecurring,
  mode,
}: {
  priceCents: number | null;
  currency: string | null;
  pricing: { canPrice: true; currency: string } | { canPrice: false; reason: string };
  isGroup: boolean;
  allowRecurring: boolean;
  mode: string;
}) {
  const scopeFenceOk = !isGroup && !allowRecurring && mode === "SOLO";
  if (!scopeFenceOk) return null;

  const initialDisplay =
    priceCents != null && currency
      ? (priceCents / 100).toFixed(2)
      : "";

  if (!pricing.canPrice) {
    return (
      <div className="rounded-lg border border-border bg-slate-50 p-4">
        <p className="text-sm font-medium text-slate-800">Charge for this event type</p>
        <p className="mt-1 text-xs text-slate-600">{pricing.reason}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border p-4">
      <p className="text-sm font-medium text-slate-800">Charge for this event type</p>
      <p className="mt-1 text-xs text-slate-600">
        Leave blank to keep it free. Amount is charged when the customer books.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <span className="text-sm text-muted-foreground">{pricing.currency}</span>
        <Input
          name="priceCents"
          type="number"
          step="1"
          min="1"
          max="10000000"
          defaultValue={initialDisplay ? Math.round(Number(initialDisplay) * 100) : ""}
          placeholder="Free"
          className="max-w-[10rem]"
        />
        <span className="text-xs text-muted-foreground">(in smallest unit; 100 = 1.00)</span>
      </div>
    </div>
  );
}
