"use client";

import { useRef, useState, useTransition } from "react";
import { importTemplatesAction } from "./actions";

export default function ImportButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setResult(null);
    const reader = new FileReader();
    reader.onload = () => {
      const json = String(reader.result ?? "");
      start(async () => {
        const res = await importTemplatesAction(json);
        if (res.ok) {
          setResult(`Imported ${res.imported}${res.skipped ? `, skipped ${res.skipped}` : ""}.`);
        } else {
          setResult(`Failed: ${res.error}`);
        }
        if (inputRef.current) inputRef.current.value = "";
      });
    };
    reader.readAsText(file);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        onChange={onFile}
        title="Choose an exported email-templates.json file"
        className="hidden"
        id="import-templates-file"
      />
      <label
        htmlFor="import-templates-file"
        className="cursor-pointer rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        {pending ? "Importing…" : "Import JSON"}
      </label>
      {result && <span className="text-sm text-slate-600">{result}</span>}
    </div>
  );
}
