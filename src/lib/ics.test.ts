import { describe, it, expect } from "vitest";
import { buildIcs, buildIcsFeed } from "@/lib/ics";

const baseInvite = {
  uid: "token-abc",
  sequence: 0,
  method: "REQUEST" as const,
  start: new Date("2026-06-02T14:00:00Z"),
  end: new Date("2026-06-02T14:30:00Z"),
  title: "Consultation",
  organizerName: "Demo Salon",
  organizerEmail: "owner@example.com",
  attendeeName: "Alex Carter",
  attendeeEmail: "alex@example.com",
};

describe("buildIcs (single invite)", () => {
  it("emits a REQUEST invite with UTC timestamps and CRLF line endings", () => {
    const ics = buildIcs(baseInvite);
    expect(ics).toContain("METHOD:REQUEST");
    expect(ics).toContain("DTSTART:20260602T140000Z");
    expect(ics).toContain("DTEND:20260602T143000Z");
    expect(ics).toContain("UID:token-abc");
    expect(ics).toContain("STATUS:CONFIRMED");
    // RFC 5545 requires CRLF; a bare LF breaks stricter calendar clients.
    expect(ics).toContain("\r\n");
    expect(ics).not.toMatch(/[^\r]\n/);
  });

  it("marks a cancellation as CANCEL + CANCELLED", () => {
    // Calendar clients key off the UID and only remove the existing event when
    // both of these say cancelled.
    const ics = buildIcs({ ...baseInvite, method: "CANCEL", sequence: 2 });
    expect(ics).toContain("METHOD:CANCEL");
    expect(ics).toContain("STATUS:CANCELLED");
    expect(ics).toContain("SEQUENCE:2");
  });

  it("escapes commas, semicolons and newlines in text fields", () => {
    // Unescaped, these terminate the property early and corrupt the file.
    const ics = buildIcs({
      ...baseInvite,
      title: "Cut, colour; blow-dry",
      description: "Line one\nLine two",
    });
    expect(ics).toContain("SUMMARY:Cut\\, colour\\; blow-dry");
    expect(ics).toContain("DESCRIPTION:Line one\\nLine two");
  });

  it("adds one ATTENDEE line per guest", () => {
    const ics = buildIcs({
      ...baseInvite,
      extraAttendees: [{ name: "Sam", email: "sam@example.com" }, { email: "jo@example.com" }],
    });
    expect(ics).toContain("ATTENDEE;CN=Sam;RSVP=TRUE:mailto:sam@example.com");
    // Falls back to the address when no name was supplied.
    expect(ics).toContain("ATTENDEE;CN=jo@example.com;RSVP=TRUE:mailto:jo@example.com");
  });

  it("omits optional properties entirely rather than emitting empty ones", () => {
    const ics = buildIcs(baseInvite);
    expect(ics).not.toContain("DESCRIPTION:");
    expect(ics).not.toContain("LOCATION:");
  });
});

describe("buildIcsFeed (subscription feed)", () => {
  const events = [
    {
      uid: "a",
      start: new Date("2026-06-02T14:00:00Z"),
      end: new Date("2026-06-02T14:30:00Z"),
      title: "Consultation",
    },
    {
      uid: "b",
      start: new Date("2026-06-03T09:00:00Z"),
      end: new Date("2026-06-03T09:30:00Z"),
      title: "Follow-up",
      tentative: true,
    },
  ];

  // The invariant that separates a feed from an invite. METHOD:REQUEST marks a
  // calendar as an *invitation*, which makes clients prompt the subscriber to
  // RSVP to every event in their own feed.
  it("never emits a METHOD line", () => {
    expect(buildIcsFeed({ calendarName: "My bookings", events })).not.toContain("METHOD:");
  });

  it("emits one VEVENT per booking in a single VCALENDAR", () => {
    const feed = buildIcsFeed({ calendarName: "My bookings", events });
    expect(feed.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(feed.match(/BEGIN:VCALENDAR/g)).toHaveLength(1);
    expect(feed).toContain("UID:a");
    expect(feed).toContain("UID:b");
  });

  it("marks unconfirmed bookings TENTATIVE so clients grey them out", () => {
    const feed = buildIcsFeed({ calendarName: "My bookings", events });
    expect(feed).toContain("STATUS:CONFIRMED");
    expect(feed).toContain("STATUS:TENTATIVE");
  });

  it("escapes the calendar name", () => {
    const feed = buildIcsFeed({ calendarName: "Bookings, all", events: [] });
    expect(feed).toContain("X-WR-CALNAME:Bookings\\, all");
  });

  it("produces a valid empty calendar when there are no bookings", () => {
    const feed = buildIcsFeed({ calendarName: "Empty", events: [] });
    expect(feed).toContain("BEGIN:VCALENDAR");
    expect(feed).toContain("END:VCALENDAR");
    expect(feed).not.toContain("BEGIN:VEVENT");
  });
});
