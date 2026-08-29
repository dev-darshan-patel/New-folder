import { describe, it, expect } from "vitest";
import {
  parseQuestions,
  serializeQuestions,
  validateAnswer,
  validateAnswers,
  validateAnswersForStorage,
  validateTicketAnswersForStorage,
  type IntakeQuestion,
} from "@/lib/intake";

function q(partial: Partial<IntakeQuestion> & { label: string }): IntakeQuestion {
  return {
    type: "text",
    required: false,
    options: [],
    scope: "order",
    ...partial,
  };
}

// The single most important property of Phase 5a: every event type created
// BEFORE typed fields existed must keep working, untouched, with no
// migration. Its questions were `{label, required}` with no `type`.
describe("parseQuestions — backwards compatibility", () => {
  it("parses a pre-Phase-5 question as a text field", () => {
    const legacy = JSON.stringify([{ label: "Your goal?", required: true }]);
    expect(parseQuestions(legacy)).toEqual([
      { label: "Your goal?", type: "text", required: true, options: [], scope: "order" },
    ]);
  });

  it("treats an unrecognised type as text rather than dropping the question", () => {
    // A question the tenant can still see and answer beats one that silently
    // vanishes from their booking form.
    const json = JSON.stringify([{ label: "Q", type: "hologram", required: false }]);
    expect(parseQuestions(json)[0].type).toBe("text");
  });

  it("returns [] for null, garbage and non-array JSON", () => {
    expect(parseQuestions(null)).toEqual([]);
    expect(parseQuestions("not json")).toEqual([]);
    expect(parseQuestions('{"label":"x"}')).toEqual([]);
  });
});

describe("parseQuestions — options handling", () => {
  it("drops blank and duplicate options", () => {
    const json = JSON.stringify([
      { label: "Size", type: "select", options: ["S", "", "M", "S", "  "] },
    ]);
    expect(parseQuestions(json)[0].options).toEqual(["S", "M"]);
  });

  // A dropdown with nothing in it can't be answered; if it were also required
  // it would make the booking form permanently unsubmittable.
  it("drops a choice field left with no usable options", () => {
    const json = JSON.stringify([
      { label: "Size", type: "select", options: ["", "  "], required: true },
      { label: "Name", type: "text" },
    ]);
    const out = parseQuestions(json);
    expect(out).toHaveLength(1);
    expect(out[0].label).toBe("Name");
  });

  it("ignores options on types that don't use them", () => {
    const json = JSON.stringify([{ label: "Note", type: "text", options: ["a", "b"] }]);
    expect(parseQuestions(json)[0].options).toEqual([]);
  });
});

describe("serializeQuestions", () => {
  it("round-trips through parse", () => {
    const fields: IntakeQuestion[] = [
      q({ label: "Shirt size", type: "select", options: ["S", "M"], required: true }),
      q({ label: "Notes", type: "textarea" }),
    ];
    expect(parseQuestions(serializeQuestions(fields))).toEqual(fields);
  });

  it("returns null when nothing usable is left, so the column stays NULL", () => {
    expect(serializeQuestions([])).toBeNull();
    expect(serializeQuestions([q({ label: "   " })])).toBeNull();
  });
});

describe("validateAnswer — required", () => {
  it("rejects an empty required answer", () => {
    const r = validateAnswer(q({ label: "Name", required: true }), "  ");
    expect(r.ok).toBe(false);
  });
  it("allows an empty optional answer", () => {
    const r = validateAnswer(q({ label: "Name" }), "");
    expect(r).toEqual({ ok: true, value: "" });
  });
});

describe("validateAnswer — per type", () => {
  it("email accepts a valid address and rejects an invalid one", () => {
    expect(validateAnswer(q({ label: "E", type: "email" }), "a@b.co").ok).toBe(true);
    expect(validateAnswer(q({ label: "E", type: "email" }), "not-an-email").ok).toBe(false);
  });

  it("phone accepts international formatting but rejects too-few digits", () => {
    expect(validateAnswer(q({ label: "P", type: "phone" }), "+91 98765 43210").ok).toBe(true);
    expect(validateAnswer(q({ label: "P", type: "phone" }), "12345").ok).toBe(false);
    expect(validateAnswer(q({ label: "P", type: "phone" }), "call me").ok).toBe(false);
  });

  it("number rejects non-numeric and normalises the stored form", () => {
    expect(validateAnswer(q({ label: "N", type: "number" }), "abc").ok).toBe(false);
    const r = validateAnswer(q({ label: "N", type: "number" }), " 007 ");
    expect(r).toEqual({ ok: true, value: "7" });
  });

  it("date rejects a wrong shape", () => {
    expect(validateAnswer(q({ label: "D", type: "date" }), "03/10/2026").ok).toBe(false);
  });

  // The interesting one: 2026-02-31 matches the regex, and `new Date` would
  // silently roll it forward to March 3rd rather than reject it.
  it("date rejects a calendar-impossible date that passes the regex", () => {
    expect(validateAnswer(q({ label: "D", type: "date" }), "2026-02-31").ok).toBe(false);
    expect(validateAnswer(q({ label: "D", type: "date" }), "2026-02-28").ok).toBe(true);
  });

  it("checkbox normalises any ticked value to Yes", () => {
    expect(validateAnswer(q({ label: "C", type: "checkbox" }), "on")).toEqual({
      ok: true,
      value: "Yes",
    });
  });

  it("select/radio reject a value not in the option list", () => {
    const sel = q({ label: "S", type: "select", options: ["S", "M"] });
    expect(validateAnswer(sel, "M").ok).toBe(true);
    // The whole point of server-side validation: the widget only offered S/M.
    expect(validateAnswer(sel, "XXL").ok).toBe(false);
  });

  it("multiselect rejects any unknown value in the set", () => {
    const ms = q({ label: "M", type: "multiselect", options: ["A", "B", "C"] });
    expect(validateAnswer(ms, "A, C").ok).toBe(true);
    expect(validateAnswer(ms, "A, Z").ok).toBe(false);
  });

  it("multiselect stores values in the question's option order, not tick order", () => {
    const ms = q({ label: "M", type: "multiselect", options: ["A", "B", "C"] });
    expect(validateAnswer(ms, "C, A")).toEqual({ ok: true, value: "A, C" });
  });
});

describe("validateAnswers", () => {
  const questions = [
    q({ label: "Name", required: true }),
    q({ label: "Size", type: "select", options: ["S", "M"], required: true }),
    q({ label: "Notes", type: "textarea" }),
  ];

  it("returns cleaned answers, omitting blank optional ones", () => {
    const r = validateAnswers(questions, [
      { label: "Name", value: "Meera" },
      { label: "Size", value: "M" },
      { label: "Notes", value: "  " },
    ]);
    expect(r).toEqual({
      ok: true,
      answers: [
        { label: "Name", value: "Meera" },
        { label: "Size", value: "M" },
      ],
    });
  });

  it("fails on the first problem", () => {
    const r = validateAnswers(questions, [{ label: "Name", value: "Meera" }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("Size");
  });

  // Extra keys a forged client might append must not end up stored — only
  // configured questions are ever persisted.
  it("ignores submitted answers that don't correspond to a question", () => {
    const r = validateAnswers([q({ label: "Name" })], [
      { label: "Name", value: "Meera" },
      { label: "isAdmin", value: "true" },
    ]);
    expect(r).toEqual({ ok: true, answers: [{ label: "Name", value: "Meera" }] });
  });
});

// Phase 5b: an order-level answer and a per-ticket answer are collected at
// different times from different inputs. Mixing up which questions belong to
// which level is the easiest way to break this feature, so both directions
// are pinned here.
describe("scope separation", () => {
  const mixed = serializeQuestions([
    q({ label: "Company", required: true, scope: "order" }),
    q({ label: "Shirt size", type: "select", options: ["S", "M"], required: true, scope: "ticket" }),
  ]);

  it("order-level validation ignores a required per-ticket question", () => {
    // The whole trap: without the scope filter this fails with "Please answer:
    // Shirt size" on every single order, because that answer is never
    // submitted at the order level.
    const r = validateAnswersForStorage(mixed, [{ label: "Company", value: "Acme" }]);
    expect(r).toEqual({ ok: true, json: JSON.stringify([{ label: "Company", value: "Acme" }]) });
  });

  it("per-ticket validation ignores order-scoped questions", () => {
    const r = validateTicketAnswersForStorage(mixed, [[{ label: "Shirt size", value: "M" }]], 1);
    expect(r).toEqual({ ok: true, json: [JSON.stringify([{ label: "Shirt size", value: "M" }])] });
  });

  it("returns one entry per ticket, positionally aligned", () => {
    const r = validateTicketAnswersForStorage(
      mixed,
      [[{ label: "Shirt size", value: "S" }], [{ label: "Shirt size", value: "M" }]],
      2,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.json).toHaveLength(2);
      expect(r.json[0]).toContain("S");
      expect(r.json[1]).toContain("M");
    }
  });

  it("names the offending ticket when one of several is incomplete", () => {
    const r = validateTicketAnswersForStorage(
      mixed,
      [[{ label: "Shirt size", value: "S" }], []],
      2,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("Ticket 2");
  });

  it("still enforces the option list per ticket", () => {
    const r = validateTicketAnswersForStorage(mixed, [[{ label: "Shirt size", value: "XXL" }]], 1);
    expect(r.ok).toBe(false);
  });

  it("requires nothing when the event type has no per-ticket questions", () => {
    const orderOnly = serializeQuestions([q({ label: "Company", required: true })]);
    expect(validateTicketAnswersForStorage(orderOnly, undefined, 3)).toEqual({
      ok: true,
      json: [null, null, null],
    });
  });
});
