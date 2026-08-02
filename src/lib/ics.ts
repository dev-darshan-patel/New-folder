// Minimal iCalendar (.ics) generator for booking invites.
import { PRODUCT_NAME } from "@/lib/brand";

type IcsInput = {
  uid: string;
  sequence: number;
  method: "REQUEST" | "CANCEL";
  start: Date;
  end: Date;
  title: string;
  description?: string | null;
  organizerName: string;
  organizerEmail: string;
  attendeeName: string;
  attendeeEmail: string;
  // Additional guests invited by the primary attendee. Each gets its own
  // ATTENDEE line so calendar clients show/RSVP them individually.
  extraAttendees?: { name?: string; email: string }[];
  // Physical location or a phone number — shown as the event's LOCATION.
  // For an online meeting this is typically the video URL.
  location?: string | null;
};

function toIcsDate(d: Date): string {
  // UTC basic format: YYYYMMDDTHHMMSSZ
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

// One event inside a subscription feed. Deliberately leaner than IcsInput:
// a feed is the owner's own calendar, so there's no RSVP/attendee round-trip.
export type IcsFeedEvent = {
  uid: string;
  start: Date;
  end: Date;
  title: string;
  description?: string | null;
  location?: string | null;
  // CONFIRMED for confirmed bookings, TENTATIVE for ones still awaiting
  // approval or payment — calendar clients grey those out.
  tentative?: boolean;
};

// Builds a multi-event VCALENDAR for a *subscription* feed (the URL a tenant
// pastes into Google/Apple/Outlook Calendar).
//
// Two deliberate differences from buildIcs() above:
//  - many VEVENTs instead of exactly one.
//  - NO METHOD line. METHOD:REQUEST marks a calendar as a meeting *invitation*,
//    which makes clients prompt the subscriber to RSVP to every event. A feed
//    is a read-only mirror, so it must stay method-less.
export function buildIcsFeed(params: {
  calendarName: string;
  events: IcsFeedEvent[];
}): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${PRODUCT_NAME}//Scheduling//EN`,
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${escapeText(params.calendarName)}`,
    // Hint to clients about how often to re-poll the feed.
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    ...params.events.flatMap((e) =>
      [
        "BEGIN:VEVENT",
        `UID:${e.uid}`,
        `DTSTAMP:${toIcsDate(new Date())}`,
        `DTSTART:${toIcsDate(e.start)}`,
        `DTEND:${toIcsDate(e.end)}`,
        `SUMMARY:${escapeText(e.title)}`,
        e.description ? `DESCRIPTION:${escapeText(e.description)}` : "",
        e.location ? `LOCATION:${escapeText(e.location)}` : "",
        `STATUS:${e.tentative ? "TENTATIVE" : "CONFIRMED"}`,
        "END:VEVENT",
      ].filter(Boolean),
    ),
    "END:VCALENDAR",
  ].filter(Boolean);
  return lines.join("\r\n");
}

export function buildIcs(input: IcsInput): string {
  const status = input.method === "CANCEL" ? "CANCELLED" : "CONFIRMED";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Booking//Scheduling//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${input.method}`,
    "BEGIN:VEVENT",
    `UID:${input.uid}`,
    `SEQUENCE:${input.sequence}`,
    `DTSTAMP:${toIcsDate(new Date())}`,
    `DTSTART:${toIcsDate(input.start)}`,
    `DTEND:${toIcsDate(input.end)}`,
    `SUMMARY:${escapeText(input.title)}`,
    input.description ? `DESCRIPTION:${escapeText(input.description)}` : "",
    input.location ? `LOCATION:${escapeText(input.location)}` : "",
    `ORGANIZER;CN=${escapeText(input.organizerName)}:mailto:${input.organizerEmail}`,
    `ATTENDEE;CN=${escapeText(input.attendeeName)};RSVP=TRUE:mailto:${input.attendeeEmail}`,
    ...(input.extraAttendees ?? []).map(
      (g) =>
        `ATTENDEE;CN=${escapeText(g.name || g.email)};RSVP=TRUE:mailto:${g.email}`,
    ),
    `STATUS:${status}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);
  // iCalendar requires CRLF line endings.
  return lines.join("\r\n");
}
