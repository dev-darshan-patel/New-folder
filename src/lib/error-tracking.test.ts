import { describe, it, expect } from "vitest";
import { fingerprintOf } from "@/lib/error-tracking";

// Fingerprinting decides whether a repeating error is ONE row with a count or
// thousands of rows that bury everything else. These pin the grouping rules.

describe("fingerprintOf", () => {
  it("is stable for the same message and route", () => {
    expect(fingerprintOf("Boom", "/api/x")).toBe(fingerprintOf("Boom", "/api/x"));
  });

  it("separates the same message on different routes", () => {
    // Same symptom in two places is usually two different problems.
    expect(fingerprintOf("Boom", "/api/x")).not.toBe(fingerprintOf("Boom", "/api/y"));
  });

  it("separates different messages on the same route", () => {
    expect(fingerprintOf("Boom", "/api/x")).not.toBe(fingerprintOf("Bang", "/api/x"));
  });

  // The point of the whole normalisation step: an error carrying a record id
  // must not create a new row per record.
  it("groups messages that differ only by a numeric id", () => {
    expect(fingerprintOf("Booking 123 not found", "/x")).toBe(
      fingerprintOf("Booking 999999 not found", "/x"),
    );
  });

  it("groups messages that differ only by a hex/cuid-ish id", () => {
    expect(fingerprintOf("User cmt9a0f3b0001 missing", "/x")).toBe(
      fingerprintOf("User cmt9zz88c0002 missing", "/x"),
    );
  });

  it("still separates genuinely different errors that both contain ids", () => {
    expect(fingerprintOf("Booking 1 not found", "/x")).not.toBe(
      fingerprintOf("Payment 1 not found", "/x"),
    );
  });

  it("treats a missing route as its own group rather than throwing", () => {
    expect(fingerprintOf("Boom")).toBe(fingerprintOf("Boom", null));
    expect(fingerprintOf("Boom")).not.toBe(fingerprintOf("Boom", "/x"));
  });

  it("produces a short fixed-length hex id", () => {
    const fp = fingerprintOf("Something went wrong", "/api/very/long/route");
    expect(fp).toMatch(/^[0-9a-f]{32}$/);
  });

  it("handles a huge message without blowing up", () => {
    const huge = "x".repeat(100_000);
    expect(fingerprintOf(huge, "/x")).toMatch(/^[0-9a-f]{32}$/);
  });
});
