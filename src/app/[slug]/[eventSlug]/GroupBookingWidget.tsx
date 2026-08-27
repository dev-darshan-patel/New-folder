"use client";

import { useEffect, useState, useTransition } from "react";
import { Check } from "lucide-react";
import { createGroupBookingAction, type BookingResult } from "../actions";
import type { IntakeQuestion } from "@/lib/intake";
import IntakeFields, { readAnswers } from "@/components/IntakeFields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { SubmitButton } from "@/components/ui/submit-button";
import { BRAND_COLOR } from "@/lib/brand";

export type GroupTier = {
  id: string;
  name: string;
  seatsLeft: number;
  // Phase 3b. Null = this category is free.
  priceCents: number | null;
};

// A client-safe stand-in for lib/payments.ts's formatPrice() — that module is
// `import "server-only"` (it reads PlatformSettings), so a client component
// can't import it directly. Every currency this app supports uses 100 minor
// units (cents/paise), same assumption formatPrice's own doc comment makes,
// so this is a faithful client-side echo, not an approximation.
function fmtMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

// A group session as passed in from the server component.
export type GroupSession = {
  id: string;
  startUtc: string;
  seatsLeft: number;
  unlimited?: boolean;
  tiers: GroupTier[];
};

// The server encodes "no cap" as Number.MAX_SAFE_INTEGER (see loadUpcomingSessions
// / the tier mapping) rather than a separate unlimited flag per number, so
// arithmetic like summing tier remainders stays simple. Never render that
// sentinel as a literal number — every "seats left" display must go through this.
const UNLIMITED_SENTINEL = Number.MAX_SAFE_INTEGER;
function formatSeatsLeft(n: number): string {
  return n >= UNLIMITED_SENTINEL ? "Unlimited" : `${n} seat${n === 1 ? "" : "s"} left`;
}

// The price that governs one ticket in this order — a tiered session's
// active tier price, or the flat event-level price when there are no tiers.
// Mirrors exactly how the server picks which price to charge (tiers replace
// the flat price the same way they replace flat capacity).
function unitPriceFor(
  session: GroupSession,
  tierId: string | null,
  flatPriceCents: number | null,
): number | null {
  if (session.tiers.length > 0) {
    return session.tiers.find((t) => t.id === tierId)?.priceCents ?? null;
  }
  return flatPriceCents;
}

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
  accent = BRAND_COLOR,
  questions = [],
  sessions,
  issuesTickets = false,
  maxTicketsPerOrder = 1,
  currency = null,
  flatPriceCents = null,
}: {
  eventTypeId: string;
  timezone: string;
  accent?: string;
  questions?: IntakeQuestion[];
  sessions: GroupSession[];
  issuesTickets?: boolean;
  maxTicketsPerOrder?: number;
  // Phase 3b. `currency` is one per event type (set the first time anything
  // on it is priced) and applies to both flatPriceCents and every tier's
  // priceCents. `flatPriceCents` only applies to a session with NO tiers —
  // a session with tiers ignores it and prices per-category instead.
  currency?: string | null;
  flatPriceCents?: number | null;
}) {
  const [selected, setSelected] = useState<GroupSession | null>(null);
  // Ticketing: how many tickets to buy and an optional name per ticket.
  const [quantity, setQuantity] = useState(1);
  const [attendeeNames, setAttendeeNames] = useState<string[]>([]);
  // Ticket category (Phase 3a) — only meaningful when the session has tiers.
  const [tierId, setTierId] = useState<string | null>(null);
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

  // Paid ticket order (Phase 3b): the seats are reserved and the booking
  // exists as PENDING_PAYMENT — send the buyer to the provider's checkout.
  // Same redirect mechanism the 1:1 BookingWidget already uses for a paid
  // SOLO booking.
  useEffect(() => {
    if (result?.ok && result.checkoutUrl) {
      window.location.href = result.checkoutUrl;
    }
  }, [result]);

  if (result?.ok && result.redirectUrl) {
    return <p className="mt-10 text-center text-sm text-muted-foreground">Redirecting…</p>;
  }

  if (result?.ok && result.checkoutUrl) {
    return (
      <p className="mt-10 text-center text-sm text-muted-foreground">
        Redirecting you to checkout…
      </p>
    );
  }

  if (result?.ok) {
    return (
      <div className="mt-10 rounded-2xl border border-green-200 bg-green-50 p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-600 text-white">
          <Check size={22} />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-foreground">You&apos;re in!</h2>
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
        <p className="mt-3 text-sm text-muted-foreground">
          A confirmation has been sent to your email.
        </p>
        {result.ticketUrls && result.ticketUrls.length > 0 && (
          <div className="mt-4 space-y-1.5">
            <p className="text-sm font-medium text-foreground">
              Your {result.ticketUrls.length === 1 ? "ticket" : `${result.ticketUrls.length} tickets`}:
            </p>
            {result.ticketUrls.map((url, i) => (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: accent }}
                className="block text-sm font-medium hover:underline"
              >
                View ticket {i + 1} →
              </a>
            ))}
          </div>
        )}
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
              <p className="rounded-lg border border-dashed border-input p-6 text-center text-sm text-muted-foreground">
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
                    setQuantity(1);
                    setAttendeeNames([]);
                    // Pre-pick the first category with room, so quantity has
                    // something sane to bound itself against immediately.
                    setTierId(s.tiers.find((t) => t.seatsLeft > 0)?.id ?? null);
                  }}
                  style={full ? undefined : { color: accent }}
                  className={`flex w-full items-center justify-between rounded-lg border border-border px-4 py-3 text-sm font-medium transition-colors ${
                    full
                      ? "cursor-not-allowed opacity-60"
                      : "hover:border-slate-400 hover:bg-slate-50"
                  }`}
                >
                  <span>{fmtSession(s.startUtc, viewerTz)}</span>
                  <span className={`text-xs ${full ? "text-red-600" : "text-muted-foreground"}`}>
                    {full ? "Full" : formatSeatsLeft(s.seatsLeft)}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            // Guard against submitting past the disabled state below —
            // categories are the source of truth for whether this order can
            // proceed at all when the session has any configured.
            if (issuesTickets && selected.tiers.length > 0 && !tierId) {
              e.preventDefault();
              return;
            }
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            setFormError(null);
            const answers = readAnswers(fd, questions);
            startSubmit(async () => {
              const res = await createGroupBookingAction({
                eventTypeId,
                sessionId: selected.id,
                name: String(fd.get("name") || ""),
                email: String(fd.get("email") || ""),
                notes: String(fd.get("notes") || ""),
                viewerTimezone: viewerTz,
                answers,
                ...(issuesTickets
                  ? {
                      quantity,
                      attendeeNames: attendeeNames.slice(0, quantity),
                      ...(selected.tiers.length > 0 && tierId ? { tierId } : {}),
                    }
                  : {}),
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
            <Button
              type="button"
              variant="link"
              size="sm"
              onClick={() => setSelected(null)}
              className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
            >
              ← Back
            </Button>
          </div>
          <div className="mt-4 space-y-3">
            {issuesTickets && (() => {
              const hasTiers = selected.tiers.length > 0;
              const activeTier = hasTiers
                ? selected.tiers.find((t) => t.id === tierId)
                : undefined;
              // No category picked (or all sold out) → nothing to buy yet.
              const tierBlocked = hasTiers && !activeTier;
              const qtyCap = hasTiers
                ? Math.min(maxTicketsPerOrder, activeTier?.seatsLeft ?? 0)
                : Math.min(maxTicketsPerOrder, selected.seatsLeft);

              // The unit price for this order: the active tier's own price
              // when tiers exist, else the flat event-level price — mirrors
              // exactly how the server picks which price governs the order.
              const unitPriceCents = hasTiers ? (activeTier?.priceCents ?? null) : flatPriceCents;

              return (
                <div className="space-y-3 rounded-lg border border-border bg-slate-50 p-3">
                  {hasTiers && (
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-slate-700">Ticket type</span>
                      <NativeSelect
                        value={tierId ?? ""}
                        onChange={(e) => {
                          setTierId(e.target.value || null);
                          setQuantity(1);
                          setAttendeeNames([]);
                        }}
                        className="w-full"
                      >
                        <option value="" disabled>
                          Choose a ticket type…
                        </option>
                        {selected.tiers.map((t) => (
                          <option key={t.id} value={t.id} disabled={t.seatsLeft <= 0}>
                            {t.name}{" "}
                            {t.seatsLeft <= 0 ? "— sold out" : `— ${formatSeatsLeft(t.seatsLeft)}`}
                            {t.priceCents != null && currency
                              ? ` — ${fmtMoney(t.priceCents, currency)}`
                              : ""}
                          </option>
                        ))}
                      </NativeSelect>
                    </label>
                  )}
                  {!hasTiers && flatPriceCents != null && currency && (
                    <p className="text-sm text-slate-700">
                      {fmtMoney(flatPriceCents, currency)} per ticket
                    </p>
                  )}
                  {tierBlocked ? (
                    <p className="text-sm text-red-600">
                      {tierId
                        ? "That ticket type just sold out — please pick another."
                        : "All ticket types are sold out."}
                    </p>
                  ) : (
                    <>
                      <label className="block text-sm">
                        <span className="mb-1 block font-medium text-slate-700">
                          Number of tickets
                        </span>
                        <NativeSelect
                          value={String(quantity)}
                          onChange={(e) => {
                            const n = Number(e.target.value);
                            setQuantity(n);
                            setAttendeeNames((prev) => {
                              const next = prev.slice(0, n);
                              while (next.length < n) next.push("");
                              return next;
                            });
                          }}
                          className="w-32"
                        >
                          {Array.from({ length: Math.max(1, qtyCap) }, (_, i) => i + 1).map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        </NativeSelect>
                      </label>
                      {unitPriceCents != null && currency && (
                        <p className="text-sm font-medium text-foreground">
                          Total: {fmtMoney(unitPriceCents * quantity, currency)}
                        </p>
                      )}
                      {quantity > 1 && (
                        <div className="space-y-2">
                          <p className="text-xs text-muted-foreground">
                            Name on each ticket (optional — helps at the gate).
                          </p>
                          {Array.from({ length: quantity }, (_, i) => (
                            <Input
                              key={i}
                              value={attendeeNames[i] ?? ""}
                              onChange={(e) =>
                                setAttendeeNames((prev) => {
                                  const next = [...prev];
                                  next[i] = e.target.value;
                                  return next;
                                })
                              }
                              placeholder={`Ticket ${i + 1} attendee (optional)`}
                            />
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })()}
            <Input name="name" required placeholder="Your name" />
            <Input name="email" type="email" required placeholder="Your email" />
            <Textarea
              name="notes"
              rows={2}
              placeholder="Anything we should know? (optional)"
            />
            <IntakeFields questions={questions} />
            {formError && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {formError}
              </p>
            )}
            <SubmitButton
              disabled={submitting || (issuesTickets && selected.tiers.length > 0 && !tierId)}
              style={{ backgroundColor: accent }}
              className="w-full"
            >
              {(() => {
                const priced =
                  issuesTickets && (unitPriceFor(selected, tierId, flatPriceCents) ?? 0) > 0;
                if (submitting) return priced ? "Redirecting to payment…" : "Booking…";
                return priced ? "Continue to payment" : "Confirm booking";
              })()}
            </SubmitButton>
          </div>
        </form>
      )}
    </div>
  );
}
