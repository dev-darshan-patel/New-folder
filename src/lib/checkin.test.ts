import { describe, it, expect } from "vitest";
import { extractTicketCode } from "@/lib/checkin";

// The scanner accepts whatever a QR reader spits out, which varies wildly by
// device. If this regex ever gets loose enough to match, say, a manageToken
// (`booked-{uuid}`) or a plan id, tickets from the wrong entity could be
// admitted. The tests below pin that shape.

const VALID = "tkt-f42faf3e-fc99-48d0-99e3-cb36a7b85aa5";

describe("extractTicketCode", () => {
  it("returns the code from a bare code input", () => {
    expect(extractTicketCode(VALID)).toBe(VALID);
  });

  it("returns the code from the full ticket URL a QR encodes", () => {
    expect(extractTicketCode(`https://bookify.example.com/ticket/${VALID}`)).toBe(VALID);
  });

  it("ignores surrounding whitespace and casing", () => {
    // Real scanners sometimes add a trailing newline; manual entry adds
    // whatever the staff member typed. Uppercase from Android's clipboard
    // history mangling has been seen in the wild.
    expect(extractTicketCode(`  ${VALID.toUpperCase()}  \n`)).toBe(VALID);
  });

  it("returns null for garbage input", () => {
    expect(extractTicketCode("hello")).toBeNull();
    expect(extractTicketCode("")).toBeNull();
    expect(extractTicketCode("https://example.com/somewhere-else")).toBeNull();
  });

  // The critical negative case. Booking manage tokens have the same UUID
  // shape but a different prefix; if the regex ever loosened to match them,
  // scanning a booking-manage URL would mark a random ticket as used.
  it("does not match a booking manage token", () => {
    expect(extractTicketCode("booked-f42faf3e-fc99-48d0-99e3-cb36a7b85aa5")).toBeNull();
  });

  it("does not match a UUID without the tkt- prefix", () => {
    expect(extractTicketCode("f42faf3e-fc99-48d0-99e3-cb36a7b85aa5")).toBeNull();
  });
});
