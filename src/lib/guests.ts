// Extra guests an invitee adds to their own booking (beyond team members,
// which are the business's own staff). Stored as JSON on Booking.guests.

export type Guest = { name?: string; email: string };

const MAX_GUESTS = 5;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function parseGuests(json: string | null | undefined): Guest[] {
  if (!json) return [];
  try {
    const data = JSON.parse(json);
    if (!Array.isArray(data)) return [];
    return data
      .filter((g) => g && typeof g.email === "string")
      .map((g) => ({
        name: typeof g.name === "string" ? String(g.name).slice(0, 200) : undefined,
        email: String(g.email).trim().toLowerCase().slice(0, 320),
      }))
      .slice(0, MAX_GUESTS);
  } catch {
    return [];
  }
}

// Validate + normalize raw guest input from the booking form. Silently drops
// invalid entries and de-dupes against the primary invitee's own email.
export function sanitizeGuests(raw: Guest[], primaryEmail: string): Guest[] {
  const primary = primaryEmail.trim().toLowerCase();
  const seen = new Set<string>([primary]);
  const out: Guest[] = [];
  for (const g of raw) {
    const email = String(g.email || "").trim().toLowerCase().slice(0, 320);
    if (!EMAIL_RE.test(email) || seen.has(email)) continue;
    seen.add(email);
    out.push({
      name: g.name?.trim().slice(0, 200) || undefined,
      email,
    });
    if (out.length >= MAX_GUESTS) break;
  }
  return out;
}
