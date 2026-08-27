import { describe, it, expect } from "vitest";
import {
  parseTicketLayout,
  serializeTicketLayout,
  normalizeField,
  DEFAULT_TICKET_LAYOUT,
  type TicketField,
} from "@/lib/ticket-template";

// parseTicketLayout runs on every public ticket render, and serializeTicketLayout
// is the only thing standing between a forged designer POST and what the
// renderer trusts. Both must be total functions: any input, always a sane
// layout out, never a throw.

describe("parseTicketLayout", () => {
  it("returns an empty layout for null/empty/garbage input", () => {
    expect(parseTicketLayout(null)).toEqual([]);
    expect(parseTicketLayout("")).toEqual([]);
    expect(parseTicketLayout("not json at all")).toEqual([]);
    // Valid JSON, wrong shape — must not throw.
    expect(parseTicketLayout('{"key":"serial"}')).toEqual([]);
    expect(parseTicketLayout("null")).toEqual([]);
  });

  it("round-trips a valid layout", () => {
    const json = serializeTicketLayout(DEFAULT_TICKET_LAYOUT);
    expect(parseTicketLayout(json)).toEqual(DEFAULT_TICKET_LAYOUT);
  });

  it("drops fields with an unrecognised key", () => {
    const json = JSON.stringify([
      { key: "serial", x: 10, y: 10, size: 4, color: "dark" },
      { key: "definitelyNotAField", x: 20, y: 20, size: 4, color: "dark" },
    ]);
    const out = parseTicketLayout(json);
    expect(out).toHaveLength(1);
    expect(out[0].key).toBe("serial");
  });

  // Two chips for the same field would render as overlapping duplicates of
  // the same value — first one wins.
  it("keeps only the first field per key", () => {
    const json = JSON.stringify([
      { key: "serial", x: 10, y: 10, size: 4, color: "dark" },
      { key: "serial", x: 90, y: 90, size: 9, color: "light" },
    ]);
    const out = parseTicketLayout(json);
    expect(out).toHaveLength(1);
    expect(out[0].x).toBe(10);
  });

  it("clamps out-of-range positions rather than dropping the field", () => {
    const json = JSON.stringify([
      { key: "serial", x: 9999, y: -9999, size: 4, color: "dark" },
    ]);
    const [field] = parseTicketLayout(json);
    expect(field.x).toBe(105);
    expect(field.y).toBe(-5);
  });

  it("clamps text and QR sizes to their own separate bounds", () => {
    const json = JSON.stringify([
      { key: "serial", x: 50, y: 50, size: 999, color: "dark" },
      { key: "qr", x: 50, y: 50, size: 999, color: "dark" },
    ]);
    const [text, qr] = parseTicketLayout(json);
    expect(text.size).toBe(20); // MAX_TEXT_SIZE
    expect(qr.size).toBe(60); // MAX_QR_SIZE — QR needs to go much larger
  });

  it("falls back to a usable size when size is missing or NaN", () => {
    const json = JSON.stringify([
      { key: "serial", x: 50, y: 50, color: "dark" },
      { key: "qr", x: 50, y: 50, size: "banana", color: "dark" },
    ]);
    const [text, qr] = parseTicketLayout(json);
    expect(text.size).toBe(5);
    expect(qr.size).toBe(28);
  });

  it("defaults an unknown colour to dark", () => {
    const json = JSON.stringify([
      { key: "serial", x: 50, y: 50, size: 4, color: "chartreuse" },
    ]);
    expect(parseTicketLayout(json)[0].color).toBe("dark");
  });

  // Guards against a hostile payload trying to make the renderer do work
  // proportional to attacker-controlled input.
  it("ignores absurdly long arrays", () => {
    const json = JSON.stringify(
      Array.from({ length: 10_000 }, () => ({ key: "serial", x: 1, y: 1, size: 4, color: "dark" })),
    );
    expect(parseTicketLayout(json)).toHaveLength(1);
  });
});

describe("serializeTicketLayout", () => {
  it("returns null for an empty layout so the column stays NULL", () => {
    expect(serializeTicketLayout([])).toBeNull();
  });

  it("normalises on the way in, so the DB never stores out-of-range values", () => {
    const hostile = [
      { key: "serial", x: 1e9, y: 1e9, size: 1e9, color: "light" },
    ] as unknown as TicketField[];
    const stored = serializeTicketLayout(hostile);
    const [field] = parseTicketLayout(stored);
    expect(field.x).toBe(105);
    expect(field.size).toBe(20);
  });

  it("drops unusable entries entirely", () => {
    const mixed = [
      { key: "serial", x: 10, y: 10, size: 4, color: "dark" },
      null,
      "nonsense",
      { key: "nope", x: 1, y: 1, size: 1, color: "dark" },
    ] as unknown as TicketField[];
    expect(parseTicketLayout(serializeTicketLayout(mixed))).toHaveLength(1);
  });
});

describe("normalizeField", () => {
  it("rejects non-objects outright", () => {
    expect(normalizeField(null)).toBeNull();
    expect(normalizeField("serial")).toBeNull();
    expect(normalizeField(42)).toBeNull();
  });
});
