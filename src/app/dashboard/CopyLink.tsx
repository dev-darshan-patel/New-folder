"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export default function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard may be unavailable; ignore
    }
  }

  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 truncate rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
        {url}
      </code>
      <Button
        type="button"
        onClick={copy}
        className="shrink-0"
      >
        {copied ? "Copied!" : "Copy"}
      </Button>
    </div>
  );
}
