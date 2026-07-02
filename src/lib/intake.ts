// Custom intake questions configured per event type, and invitee answers.

export type IntakeQuestion = { label: string; required: boolean };
export type IntakeAnswer = { label: string; value: string };

export function parseQuestions(json: string | null | undefined): IntakeQuestion[] {
  if (!json) return [];
  try {
    const data = JSON.parse(json);
    if (!Array.isArray(data)) return [];
    return data
      .filter((q) => q && typeof q.label === "string")
      .map((q) => ({ label: String(q.label).slice(0, 120), required: Boolean(q.required) }));
  } catch {
    return [];
  }
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
