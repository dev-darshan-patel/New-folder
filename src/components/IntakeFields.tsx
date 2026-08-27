"use client";

import { MULTI_SEPARATOR, type IntakeQuestion } from "@/lib/intake";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";

// Renders an event type's intake questions as real typed inputs. Shared by
// the 1:1 and group booking widgets so the two can never drift into rendering
// the same configured form differently.
//
// Uncontrolled on purpose: the fields live inside each widget's own <form>,
// and readAnswers() below pulls them straight out of FormData at submit —
// which keeps this component stateless and means adding a field type here
// requires no change in either widget.

// Field name for question i. Index-based rather than label-based so a label
// containing odd characters can't produce a malformed form field name.
function fieldName(index: number): string {
  return `q-${index}`;
}

export function readAnswers(
  fd: FormData,
  questions: IntakeQuestion[],
): { label: string; value: string }[] {
  return questions.map((q, i) => {
    if (q.type === "multiselect") {
      // Several checkboxes share one name; getAll collects every ticked box.
      // Joined here into the same display-ready string the server validates
      // and stores.
      const picked = fd.getAll(fieldName(i)).map((v) => String(v));
      return { label: q.label, value: picked.join(MULTI_SEPARATOR) };
    }
    return { label: q.label, value: String(fd.get(fieldName(i)) ?? "") };
  });
}

export default function IntakeFields({ questions }: { questions: IntakeQuestion[] }) {
  if (questions.length === 0) return null;

  return (
    <>
      {questions.map((q, i) => {
        const name = fieldName(i);
        const labelText = q.required ? `${q.label} *` : `${q.label} (optional)`;

        // Choice groups and the standalone checkbox need a visible label
        // element of their own; the single-input types can carry it as a
        // placeholder, which is how this form looked before typed fields.
        if (q.type === "multiselect" || q.type === "radio") {
          return (
            <fieldset key={i} className="rounded-lg border border-border p-3">
              <legend className="px-1 text-sm font-medium text-slate-700">{labelText}</legend>
              <div className="mt-1 space-y-1.5">
                {q.options.map((opt) => (
                  <label key={opt} className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type={q.type === "radio" ? "radio" : "checkbox"}
                      name={name}
                      value={opt}
                      // Radio groups can be enforced natively; a checkbox
                      // group can't (any one box would satisfy `required`),
                      // so multiselect leans on the server check instead.
                      required={q.type === "radio" && q.required}
                      className="h-4 w-4 border-input"
                    />
                    {opt}
                  </label>
                ))}
              </div>
            </fieldset>
          );
        }

        if (q.type === "checkbox") {
          return (
            <label key={i} className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                name={name}
                value="Yes"
                required={q.required}
                className="h-4 w-4 rounded border-input"
              />
              {labelText}
            </label>
          );
        }

        if (q.type === "select") {
          return (
            <label key={i} className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">{labelText}</span>
              <NativeSelect name={name} required={q.required} defaultValue="">
                <option value="" disabled={q.required}>
                  Choose…
                </option>
                {q.options.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </NativeSelect>
            </label>
          );
        }

        if (q.type === "textarea") {
          return (
            <Textarea key={i} name={name} rows={3} required={q.required} placeholder={labelText} />
          );
        }

        if (q.type === "date") {
          return (
            <label key={i} className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">{labelText}</span>
              {/* A date input has no usable placeholder, so the label has to
                  carry the question — otherwise it's a bare box. */}
              <Input type="date" name={name} required={q.required} />
            </label>
          );
        }

        const inputType =
          q.type === "email" ? "email" : q.type === "phone" ? "tel" : q.type === "number" ? "number" : "text";
        return (
          <Input
            key={i}
            type={inputType}
            name={name}
            required={q.required}
            placeholder={labelText}
          />
        );
      })}
    </>
  );
}
