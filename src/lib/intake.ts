// Custom intake questions configured per event type, and invitee answers.
//
// Phase 5a turned these from "a list of text boxes" into typed form fields.
// The storage format stayed backwards-compatible on purpose: an old
// `{label, required}` question parses as a `text` field, so every event type
// created before this keeps working with no migration and no backfill.
//
// Answers stay `{label, value}` string pairs for the same reason — they're
// already rendered as text in confirmation emails, the owner's roster and CSV
// export, and re-keying them would have meant migrating historical bookings.
// Multi-value answers are joined for display (see formatAnswerValue).

export const FORM_FIELD_TYPES = [
  "text",
  "textarea",
  "email",
  "phone",
  "number",
  "date",
  "select",
  "radio",
  "multiselect",
  "checkbox",
] as const;

export type FormFieldType = (typeof FORM_FIELD_TYPES)[number];

export const FIELD_TYPE_LABELS: Record<FormFieldType, string> = {
  text: "Short text",
  textarea: "Long text",
  email: "Email",
  phone: "Phone",
  number: "Number",
  date: "Date",
  select: "Dropdown",
  radio: "Radio buttons",
  multiselect: "Checkboxes (multiple)",
  checkbox: "Single checkbox",
};

// Types whose answer must come from a fixed option list.
export function hasOptions(type: FormFieldType): boolean {
  return type === "select" || type === "radio" || type === "multiselect";
}

export type IntakeQuestion = {
  label: string;
  type: FormFieldType;
  required: boolean;
  // Only meaningful when hasOptions(type). Always present (possibly empty) so
  // consumers never have to null-check it.
  options: string[];
  // Phase 5a only ever writes "order" (one answer per booking). "ticket"
  // (one answer per admission ticket — shirt size per runner) is carried in
  // the type from the start so adding it later is additive rather than a
  // stored-format change.
  scope: "order" | "ticket";
};

export type IntakeAnswer = { label: string; value: string };

const MAX_LABEL = 120;
const MAX_OPTIONS = 40;
const MAX_OPTION_LABEL = 120;
export const MAX_TEXT_ANSWER = 2000;
const MAX_SHORT_ANSWER = 500;

function asType(value: unknown): FormFieldType {
  // The pre-Phase-5 shape had no `type` at all — those are text fields.
  return typeof value === "string" && (FORM_FIELD_TYPES as readonly string[]).includes(value)
    ? (value as FormFieldType)
    : "text";
}

function asOptions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of value.slice(0, MAX_OPTIONS)) {
    const s = String(raw ?? "").trim().slice(0, MAX_OPTION_LABEL);
    // Blank and duplicate options are dropped: both render as unpickable or
    // ambiguous choices, and a duplicate would make the answer meaningless.
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

export function parseQuestions(json: string | null | undefined): IntakeQuestion[] {
  if (!json) return [];
  try {
    const data = JSON.parse(json);
    if (!Array.isArray(data)) return [];
    return data
      .filter((q) => q && typeof q.label === "string")
      .map((q) => {
        const type = asType(q.type);
        return {
          label: String(q.label).slice(0, MAX_LABEL),
          type,
          required: Boolean(q.required),
          options: hasOptions(type) ? asOptions(q.options) : [],
          scope: q.scope === "ticket" ? "ticket" : "order",
        } satisfies IntakeQuestion;
      })
      // A choice field with no options can't be answered at all — it would
      // render as an empty dropdown that a required check then blocks the
      // booking on. Dropping it is the only non-trapping option.
      .filter((q) => !hasOptions(q.type) || q.options.length > 0);
  } catch {
    return [];
  }
}

export function serializeQuestions(questions: IntakeQuestion[]): string | null {
  const clean = questions
    .map((q) => {
      const type = asType(q.type);
      return {
        label: String(q.label ?? "").trim().slice(0, MAX_LABEL),
        type,
        required: Boolean(q.required),
        options: hasOptions(type) ? asOptions(q.options) : [],
        scope: q.scope === "ticket" ? "ticket" : "order",
      } satisfies IntakeQuestion;
    })
    .filter((q) => q.label !== "")
    .filter((q) => !hasOptions(q.type) || q.options.length > 0);
  return clean.length > 0 ? JSON.stringify(clean) : null;
}

export function parseAnswers(json: string | null | undefined): IntakeAnswer[] {
  if (!json) return [];
  try {
    const data = JSON.parse(json);
    if (!Array.isArray(data)) return [];
    return data
      .filter((a) => a && typeof a.label === "string")
      .map((a) => ({ label: String(a.label), value: String(a.value ?? "") }));
  } catch {
    return [];
  }
}

// The separator used to join a multiselect answer into its stored string.
// Answers are displayed as text everywhere downstream, so they're stored
// display-ready rather than as nested JSON.
export const MULTI_SEPARATOR = ", ";

export type AnswerValidation =
  | { ok: true; value: string }
  | { ok: false; error: string };

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
// Deliberately permissive: digits, spaces and the usual punctuation, 6-20
// digits. Phone formats vary far too much internationally to validate
// strictly, and a rejected-but-valid number is worse than a loose one.
const PHONE_RE = /^[+()\-.\s\d]{6,32}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Validate and normalise one answer against its question. This is the
// server-side gate — the widget's own input types are a convenience, not a
// guarantee, since the action is directly callable.
export function validateAnswer(question: IntakeQuestion, raw: string): AnswerValidation {
  const value = String(raw ?? "").trim();

  if (value === "") {
    if (question.required) return { ok: false, error: `Please answer: ${question.label}` };
    return { ok: true, value: "" };
  }

  switch (question.type) {
    case "email":
      if (!EMAIL_RE.test(value)) {
        return { ok: false, error: `${question.label}: enter a valid email address.` };
      }
      return { ok: true, value: value.slice(0, MAX_SHORT_ANSWER) };

    case "phone":
      if (!PHONE_RE.test(value) || (value.match(/\d/g) ?? []).length < 6) {
        return { ok: false, error: `${question.label}: enter a valid phone number.` };
      }
      return { ok: true, value: value.slice(0, MAX_SHORT_ANSWER) };

    case "number": {
      const n = Number(value);
      if (!Number.isFinite(n)) {
        return { ok: false, error: `${question.label}: enter a number.` };
      }
      return { ok: true, value: String(n) };
    }

    case "date": {
      if (!DATE_RE.test(value)) {
        return { ok: false, error: `${question.label}: enter a valid date.` };
      }
      // Catches shapes the regex allows but the calendar doesn't, e.g.
      // 2026-02-31 — Date would silently roll that over to March 3rd.
      const [y, m, d] = value.split("-").map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d));
      if (
        dt.getUTCFullYear() !== y ||
        dt.getUTCMonth() !== m - 1 ||
        dt.getUTCDate() !== d
      ) {
        return { ok: false, error: `${question.label}: enter a valid date.` };
      }
      return { ok: true, value };
    }

    case "checkbox":
      // Any non-empty submitted value means ticked; normalise so stored
      // answers read consistently rather than as "on"/"1"/"true".
      return { ok: true, value: "Yes" };

    case "select":
    case "radio":
      if (!question.options.includes(value)) {
        return { ok: false, error: `${question.label}: choose one of the listed options.` };
      }
      return { ok: true, value };

    case "multiselect": {
      const picked = value
        .split(MULTI_SEPARATOR.trim())
        .map((s) => s.trim())
        .filter(Boolean);
      const unknown = picked.filter((p) => !question.options.includes(p));
      if (unknown.length > 0) {
        return { ok: false, error: `${question.label}: choose from the listed options.` };
      }
      // Re-joined from the question's own option order so the stored answer
      // doesn't depend on the order the invitee happened to tick boxes in.
      const ordered = question.options.filter((o) => picked.includes(o));
      return { ok: true, value: ordered.join(MULTI_SEPARATOR) };
    }

    case "textarea":
      return { ok: true, value: value.slice(0, MAX_TEXT_ANSWER) };

    case "text":
    default:
      return { ok: true, value: value.slice(0, MAX_SHORT_ANSWER) };
  }
}

// Validate a whole submission. Returns either the cleaned answers to store,
// or the FIRST error — one clear message at a time is more actionable on a
// booking form than a wall of them.
export function validateAnswers(
  questions: IntakeQuestion[],
  submitted: { label: string; value: string }[],
): { ok: true; answers: IntakeAnswer[] } | { ok: false; error: string } {
  const answers: IntakeAnswer[] = [];
  for (const question of questions) {
    const match = submitted.find((s) => s.label === question.label);
    const result = validateAnswer(question, match?.value ?? "");
    if (!result.ok) return { ok: false, error: result.error };
    if (result.value !== "") answers.push({ label: question.label, value: result.value });
  }
  return { ok: true, answers };
}

// What every booking action actually needs: validate a submission against the
// event type's configured questions and hand back the JSON to store (or the
// first error). Exists so the three booking paths — 1:1, recurring and group
// — can't drift apart on validation, which is exactly what happened before
// when each carried its own copy of a required-fields loop.
export function validateAnswersForStorage(
  questionsJson: string | null | undefined,
  submitted: { label: string; value: string }[] | undefined,
): { ok: true; json: string | null } | { ok: false; error: string } {
  const questions = parseQuestions(questionsJson);
  // Cap the submitted list before doing any work with it — it's client-supplied.
  const capped = (submitted ?? []).slice(0, 100).map((a) => ({
    label: String(a?.label ?? "").slice(0, MAX_LABEL),
    value: String(a?.value ?? ""),
  }));
  const result = validateAnswers(questions, capped);
  if (!result.ok) return result;
  return { ok: true, json: result.answers.length > 0 ? JSON.stringify(result.answers) : null };
}
