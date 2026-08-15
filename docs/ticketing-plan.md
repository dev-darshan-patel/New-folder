# Ticketing & Events — implementation plan

Status: **planning complete, Phase 1 in progress.** This is the finalized spec
from the design discussion; it turns Bookify from a Calendly-style scheduler
into "Calendly + Eventbrite-lite" — dated events with tickets, QR check-in,
ticket classes, a ticket-artwork designer, and richer registration forms.

## Scope decisions (already made — do not re-litigate)

- **Target scale:** hundreds to low thousands of tickets per event (garba,
  marathons, local concerts, small sports events). NOT flash-sale scale
  (tens of thousands in minutes) — that's a different product with queueing
  and bot defense, explicitly out of scope. The existing atomic-counter +
  rate-limit design is correct for the target scale.
- **No individual seat inventory / seat maps.** Tenants sell ticket *classes*
  (VIP / Premium / Normal — free-text names), each with its own price and
  quantity. A ticket prints its class, not a seat number. (Real seat labels
  could be a future phase; nothing here blocks it.)
- **Seat/ticket picking:** buyer picks a *class*, not a specific seat.
- **Ticket artwork:** tenant uploads one rectangular image (designed
  externally in Canva/etc.), then drag-positions a fixed set of dynamic
  fields onto it (ticket number, name, class, event name, date, QR). Not a
  freeform canvas — a constrained positioning editor over ~6 fixed chips.
- **Serial / bib numbers:** auto-generated sequential per event, tenant-editable,
  unique per event.
- **Manual registration:** organizer can add attendees from the dashboard
  (walk-in / cash / phone), extending the existing manual-bookings feature.
- **Payment hold window:** 10 minutes (industry standard), reusing the
  existing payment-hold + cron-expiry machinery.
- **Ticket artifact:** HTML ticket page with QR (v1). Downloadable PNG is a
  later add via Satori (`next/og`), already a dependency — no new libs needed.

## What already exists and is reused (not rebuilt)

- `Session` model: dated occurrence with `capacity` + `seatsTaken`, claimed by
  an atomic `UPDATE ... WHERE seatsTaken < capacity` (race-safe). Ticketed
  events are a flavor of this, not a parallel system.
- `Booking.manageToken`: unguessable per-booking token (the token-not-login
  pattern for public self-service). Tickets follow the same pattern.
- `qrcode` package: already a dependency (used for 2FA). Zero new deps for QR.
- Payments: `priceCents`/`amountCents`/`paymentStatus`/`payoutStatus`, Stripe +
  Razorpay, escrow holds, `expireStalePaymentHolds` cron. Ticket inventory
  holds reuse the hold+cron pattern.
- Storage abstraction (S3/R2/Blob/local, admin-configurable) + magic-byte image
  validation: ticket artwork upload rides this pipe.
- `intakeQuestions` JSON: the seed the form builder upgrades (never a rewrite —
  old rows parse forward).
- Feature-gate registry (`planHasFeature`): ticketing is gated behind a new
  `ticketing` feature key. Downgrade rule applies: existing data keeps working,
  gates only block *creating new* gated things.
- Server-side validation is always the boundary; UI hiding is courtesy only.
- Store UTC, interpret in the tenant's timezone. Every mutation re-checks
  ownership. Email never blocks the primary action.

## Phases (each independently shippable, verified end-to-end, own commit)

### Phase 1 — Ticket core + unlimited mode + quantity
- `Ticket` model: `id`, `bookingId` (FK, cascade), unique short `code` (QR
  payload), per-event `serial` (int, editable, unique-per-session), optional
  `attendeeName`, `status` (ISSUED / CHECKED_IN / VOID), `checkedInAt`.
- Ticketed flavor of Session: `admissionMode` (UNLIMITED / COUNTED), nullable
  capacity for UNLIMITED. Buy-N-in-one-checkout: the atomic claim becomes
  `+ N ... WHERE seatsTaken + N <= capacity` (skipped entirely when unlimited —
  so garba-scale sales have zero contention). One Ticket row per seat.
- Public ticket page `/ticket/[code]` (token-not-login) rendering a QR of the
  code via the `qrcode` lib on a clean default ticket. Tickets embedded in the
  confirmation email.
- Free (₹0) tickets work — RSVP events covered.
- **Ships:** garba passes, free events, simple capped events with quantity.

### Phase 2 — Check-in
- Owner scanner page: phone camera (a small scan lib) + manual code entry
  fallback. Atomic mark-used: `UPDATE ... WHERE code = ? AND status = 'ISSUED'`
  — a second scan of the same ticket fails loudly; concurrent gate staff safe.
- Live per-session checked-in count. Gated behind the `ticketing` feature key.
- **Ships:** the thing that makes tickets real.

### Phase 3 — Ticket classes (tiers)
- `TicketTier` per session: name (free text), price, own quantity (or
  unlimited), optional sales window. Per-tier atomic claim. Tier picker in the
  booking widget. 10-min inventory hold during checkout (reuse hold machinery).
- Same downgrade rule: existing tiers keep working if the plan loses the gate.
- **Ships:** VIP/Premium/Normal; marathon categories (5K/Half/Full);
  early-bird pricing.

### Phase 4 — Ticket template designer
- Tenant uploads rectangular artwork (via storage abstraction + image
  validation). Aspect ratio taken from the image.
- Drag a fixed set of field chips (ticket number, attendee name, class, event
  name, date, QR) into position. Each chip stores position as %, font size,
  light/dark color. QR always gets a white pad (contrast/quiet-zone — gate
  scanners fail otherwise). Long text shrinks-to-fit within a max width.
- Render: HTML — background image in an aspect-locked box, fields absolutely
  positioned at stored %. No artwork uploaded → the Phase 1 default ticket.
- Plan-gate candidate (like custom branding). PNG download deferred (Satori).
- **Ships:** designed garba/concert tickets.

### Phase 5 — Form builder
- Typed fields (text, textarea, select, multiselect, checkbox, radio, email,
  phone, number, date) with options + required + `scope: order | ticket`
  (per-ticket "attendee name/age/shirt size" is what makes tickets nameable).
- Old text-only intake questions parse as `type: "text"` — zero migration.
- Server-side validation per type. Builder UI: add → configure → drag-reorder
  (dnd-kit). Benefits appointments too, not just events.
- **Ships:** complete marathon registration; professional forms everywhere.

### Phase 6 — Manual registration + serial control
- Organizer adds attendees from the dashboard (extends manual-bookings).
- Edit bib/serial with per-event uniqueness. Resend ticket email.
- **Ships:** walk-ins, cash sales, race-kit desk.

### Deferred (only on real buyer demand)
Individual seat labels, waitlists, wallet passes, PNG ticket download,
transfer/resale, visual seat-map designer, flash-sale hardening.

## Verification discipline (every phase)
`npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build` all clean;
migrations via the project's manual flow; real end-to-end verification against
the running app (not just "it should work"); one commit per phase.

## Minimum sellable
After **Phase 1 + 2** there is a complete story: buy a ticket, get a QR, get
scanned in. Phases 3–6 are additive and (after 2) mutually independent.
