"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { interpolate, wrapHtml, type EmailBrand } from "@/lib/email-render";
import {
  updateEmailTemplateAction,
  sendTemplateTestAction,
  type TemplateFormState,
} from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Var = { name: string; description: string; sample: string };

type Props = {
  templateKey: string;
  vars: Var[];
  initial: { subject: string; html: string; text: string };
  brand: EmailBrand;
};

export default function TemplateEditor({ templateKey, vars, initial, brand }: Props) {
  const [state, formAction, pending] = useActionState<TemplateFormState, FormData>(
    updateEmailTemplateAction,
    null,
  );

  const [subject, setSubject] = useState(initial.subject);
  const [html, setHtml] = useState(initial.html);
  const [text, setText] = useState(initial.text);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");

  // Track which field last had focus so the variable palette inserts there.
  const [activeField, setActiveField] = useState<"subject" | "html" | "text">("html");
  const subjectRef = useRef<HTMLInputElement>(null);
  const htmlRef = useRef<HTMLTextAreaElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  // Build a sample context for the live preview.
  const ctx: Record<string, string> = {};
  for (const v of vars) ctx[v.name] = v.sample;
  const previewSubject = interpolate(subject, ctx);
  const previewHtml = wrapHtml(interpolate(html, ctx), brand);

  function insertVar(token: string) {
    const snippet = `{{${token}}}`;
    if (activeField === "subject") {
      const el = subjectRef.current;
      const pos = el?.selectionStart ?? subject.length;
      setSubject(subject.slice(0, pos) + snippet + subject.slice(pos));
    } else if (activeField === "text") {
      const el = textRef.current;
      const pos = el?.selectionStart ?? text.length;
      setText(text.slice(0, pos) + snippet + text.slice(pos));
    } else {
      const el = htmlRef.current;
      const pos = el?.selectionStart ?? html.length;
      setHtml(html.slice(0, pos) + snippet + html.slice(pos));
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
      {/* Editor column */}
      <div>
        <form action={formAction} className="space-y-5">
          <input type="hidden" name="key" value={templateKey} />

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Subject</label>
            <input
              ref={subjectRef}
              name="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              onFocus={() => setActiveField("subject")}
              title="Email subject line"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">HTML body</label>
            <textarea
              ref={htmlRef}
              name="html"
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              onFocus={() => setActiveField("html")}
              rows={12}
              title="HTML email body"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />
            <p className="text-xs text-slate-400">
              Rendered inside the shared branded header/footer shell.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Plain-text body</label>
            <textarea
              ref={textRef}
              name="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onFocus={() => setActiveField("text")}
              rows={8}
              title="Plain-text email body"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />
            <p className="text-xs text-slate-400">
              Fallback for clients that don&rsquo;t render HTML. Keep it in sync.
            </p>
          </div>

          {state && "error" in state && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
          )}
          {state && "ok" in state && (
            <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
              {state.message}
            </p>
          )}

          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save template"}
          </Button>
        </form>

        {/* Variable palette */}
        <div className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-700">Available variables</p>
          <p className="mt-0.5 text-xs text-slate-500">
            Click to insert into the {activeField === "html" ? "HTML" : activeField} field.
          </p>
          <div className="mt-3 space-y-1.5">
            {vars.map((v) => (
              <button
                key={v.name}
                type="button"
                onClick={() => insertVar(v.name)}
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left hover:border-indigo-300 hover:bg-indigo-50"
              >
                <code className="text-xs font-semibold text-indigo-600">{`{{${v.name}}}`}</code>
                <span className="truncate text-xs text-slate-500">{v.description}</span>
              </button>
            ))}
          </div>
        </div>

        <TestSend templateKey={templateKey} />
      </div>

      {/* Preview column */}
      <div className="lg:sticky lg:top-6 lg:self-start">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-700">Live preview</p>
          <div className="flex gap-1 rounded-lg border border-slate-200 p-0.5">
            {(["desktop", "mobile"] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDevice(d)}
                className={`rounded-md px-3 py-1 text-xs font-medium capitalize ${
                  device === d ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm">
          <span className="text-slate-400">Subject: </span>
          <span className="font-medium text-slate-800">{previewSubject}</span>
        </div>

        <div className="mt-3 flex justify-center rounded-xl border border-slate-200 bg-slate-100 p-4">
          <iframe
            title="Email preview"
            srcDoc={previewHtml}
            className="h-[600px] rounded-lg border border-slate-200 bg-white transition-all"
            style={{ width: device === "mobile" ? 375 : "100%" }}
          />
        </div>
      </div>
    </div>
  );
}

function TestSend({ templateKey }: { templateKey: string }) {
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="mt-8 rounded-xl border border-slate-200 p-4">
      <p className="text-sm font-semibold text-slate-700">Send a test</p>
      <p className="mt-0.5 text-xs text-slate-500">
        Sends this template filled with sample data using the active email provider.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="recipient@example.com"
          title="Test recipient email"
          className="w-60"
        />
        <Button
          type="button"
          variant="outline"
          disabled={pending || !email.includes("@")}
          onClick={() => {
            setResult(null);
            start(async () => setResult(await sendTemplateTestAction(templateKey, email)));
          }}
        >
          {pending ? "Sending…" : "Send test"}
        </Button>
      </div>
      {result && (
        <p className={`mt-2 text-sm font-medium ${result.ok ? "text-green-700" : "text-red-600"}`}>
          {result.ok ? `Sent to ${email}.` : `Failed: ${result.error}`}
        </p>
      )}
    </div>
  );
}
