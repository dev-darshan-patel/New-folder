// Ticket designer (Phase 4) — the shape of a tenant's ticket layout and the
// only code allowed to parse or serialize it. No DB / no `server-only`
// import, so the designer (a client component), the public ticket page (a
// server component) and unit tests all share exactly one definition of what
// a valid layout is.
//
// Coordinates are PERCENTAGES of the rendered artwork box, and sizes are in
// `cqw` (percent of the card's own width, via CSS container queries). That
// combination is what makes one stored layout render identically at any card
// width and for any artwork aspect ratio — there is deliberately no stored
// pixel value or aspect ratio anywhere.

export const TICKET_FIELD_KEYS = [
  "serial",
  "attendeeName",
  "tierName",
  "eventTitle",
  "eventDate",
  "qr",
] as const;

export type TicketFieldKey = (typeof TICKET_FIELD_KEYS)[number];

export const TICKET_FIELD_LABELS: Record<TicketFieldKey, string> = {
  serial: "Ticket number",
  attendeeName: "Attendee name",
  tierName: "Ticket category",
  eventTitle: "Event name",
  eventDate: "Date & time",
  qr: "QR code",
};

export type TicketField = {
  key: TicketFieldKey;
  // Position of the field's CENTRE, as a % of the artwork box. Centre-based
  // (rather than top-left) so dragging feels natural and centring a field on
  // the artwork is exact rather than "close enough minus half the text width".
  x: number;
  y: number;
  // Text: font size in cqw. QR: width in cqw.
  size: number;
  // Two options only, not a colour picker: ticket artwork is usually either
  // light or dark behind a given field, and those are the only two choices
  // that stay legible. Rendered as near-black / near-white.
  color: "light" | "dark";
};

// Bounds. Positions may sit slightly outside the artwork (a designer might
// want a field flush to an edge) but never so far it's unreachable.
const MIN_POS = -5;
const MAX_POS = 105;
const MIN_TEXT_SIZE = 1.5;
const MAX_TEXT_SIZE = 20;
const MIN_QR_SIZE = 8;
const MAX_QR_SIZE = 60;

export function sizeBounds(key: TicketFieldKey): { min: number; max: number } {
  return key === "qr"
    ? { min: MIN_QR_SIZE, max: MAX_QR_SIZE }
    : { min: MIN_TEXT_SIZE, max: MAX_TEXT_SIZE };
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

// Rounded to 2dp so the stored JSON stays small and diffable — sub-pixel
// precision beyond that is meaningless on a rendered ticket.
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function isTicketFieldKey(value: unknown): value is TicketFieldKey {
  return typeof value === "string" && (TICKET_FIELD_KEYS as readonly string[]).includes(value);
}

// Normalise one candidate field, or null if it isn't usable at all. Every
// numeric value is clamped rather than rejected: a layout that's slightly out
// of range should snap back into a sane position, not vanish from the ticket.
export function normalizeField(raw: unknown): TicketField | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (!isTicketFieldKey(o.key)) return null;
  const { min, max } = sizeBounds(o.key);
  const fallbackSize = o.key === "qr" ? 28 : 5;
  return {
    key: o.key,
    x: round2(clamp(Number(o.x), MIN_POS, MAX_POS)),
    y: round2(clamp(Number(o.y), MIN_POS, MAX_POS)),
    size: round2(
      clamp(Number.isFinite(Number(o.size)) ? Number(o.size) : fallbackSize, min, max),
    ),
    color: o.color === "light" ? "light" : "dark",
  };
}

// Parse the stored JSON string. Tolerant by design — this runs on every
// public ticket render, so bad data must degrade to "no fields" (which shows
// the artwork alone) rather than throw and 500 someone's ticket at the gate.
//
// At most one field per key: the designer places each field once, and a
// duplicate would render two overlapping copies of the same value.
export function parseTicketLayout(json: string | null | undefined): TicketField[] {
  if (!json) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const seen = new Set<TicketFieldKey>();
  const out: TicketField[] = [];
  for (const item of parsed.slice(0, TICKET_FIELD_KEYS.length * 2)) {
    const field = normalizeField(item);
    if (!field || seen.has(field.key)) continue;
    seen.add(field.key);
    out.push(field);
  }
  return out;
}

// Serialize for storage. Runs the same normalisation as parsing so a forged
// or buggy client can't write values the renderer would then have to defend
// against — the DB only ever holds already-clamped, already-deduped data.
export function serializeTicketLayout(fields: TicketField[]): string | null {
  const seen = new Set<TicketFieldKey>();
  const clean: TicketField[] = [];
  for (const f of fields) {
    const field = normalizeField(f);
    if (!field || seen.has(field.key)) continue;
    seen.add(field.key);
    clean.push(field);
  }
  // An empty layout is stored as NULL, not "[]" — "no layout" and "a layout
  // with nothing on it" are the same thing, and NULL is what every other
  // "unset" column in this schema uses.
  return clean.length > 0 ? JSON.stringify(clean) : null;
}

// Where fields land the first time a tenant uploads artwork: a sensible
// starting ticket they can then drag around, rather than an empty canvas with
// everything stacked in one corner.
//
// Tuned for a LANDSCAPE ticket (roughly 2:1 to 3:1), because that's the shape
// real event tickets are: a text block on the left, QR on the right stub.
// This matters more than it looks — sizes are in cqw (% of WIDTH), so on a
// wide ticket a given size eats proportionally much more of the height. An
// earlier, taller-ticket-shaped default overlapped badly the moment it met a
// normal 2.5:1 ticket. Sizes here are deliberately conservative: too small is
// a slider drag away, too large is an unreadable mess on first open.
export const DEFAULT_TICKET_LAYOUT: TicketField[] = [
  { key: "eventTitle", x: 42, y: 22, size: 4.5, color: "dark" },
  { key: "attendeeName", x: 42, y: 42, size: 3.4, color: "dark" },
  { key: "tierName", x: 42, y: 57, size: 2.8, color: "dark" },
  { key: "eventDate", x: 42, y: 71, size: 2.4, color: "dark" },
  { key: "serial", x: 42, y: 86, size: 2.6, color: "dark" },
  { key: "qr", x: 84, y: 50, size: 22, color: "dark" },
];
