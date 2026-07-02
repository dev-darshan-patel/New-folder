"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";

type EventTypeOption = { slug: string; title: string };

export default function EmbedSnippets({
  appUrl,
  slug,
  eventTypes,
  brandColor,
  brandFont,
}: {
  appUrl: string;
  slug: string;
  eventTypes: EventTypeOption[];
  brandColor: string;
  brandFont: string;
}) {
  const [eventSlug, setEventSlug] = useState(eventTypes[0]?.slug ?? "");
  const path = `${slug}/${eventSlug}`;

  const inline =
    `<div data-booking="${path}" data-accent="${brandColor}" data-font="${brandFont}"></div>\n` +
    `<script src="${appUrl}/embed.js" async></script>`;

  const popup =
    `<button data-booking-popup="${path}" data-accent="${brandColor}" data-font="${brandFont}">Book a meeting</button>\n` +
    `<script src="${appUrl}/embed.js" async></script>`;

  const previewSrc = `${appUrl}/${path}?embed=1&accent=${brandColor.replace(
    /^#/,
    "",
  )}&font=${brandFont}`;

  return (
    <div className="mt-6 space-y-8">
      <div className="max-w-xs space-y-2">
        <Label>Event type</Label>
        <NativeSelect
          value={eventSlug}
          onChange={(e) => setEventSlug(e.target.value)}
        >
          {eventTypes.map((et) => (
            <option key={et.slug} value={et.slug}>
              {et.title}
            </option>
          ))}
        </NativeSelect>
      </div>

      <Snippet
        title="Inline embed"
        desc="Shows the booking calendar directly in your page."
        code={inline}
      />
      <Snippet
        title="Popup button"
        desc="Adds a button that opens booking in a popup."
        code={popup}
      />

      <div>
        <p className="text-sm font-semibold text-slate-700">Live preview</p>
        <p className="text-xs text-slate-500">
          This is exactly what visitors see, with your branding applied.
        </p>
        <div className="mt-2 overflow-hidden rounded-2xl border border-slate-200">
          <iframe
            key={previewSrc}
            src={previewSrc}
            title="Embed preview"
            className="h-[520px] w-full"
          />
        </div>
      </div>
    </div>
  );
}

function Snippet({
  title,
  desc,
  code,
}: {
  title: string;
  desc: string;
  code: string;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }
  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-800">{title}</p>
          <p className="text-xs text-slate-500">{desc}</p>
        </div>
        <Button
          type="button"
          onClick={copy}
          variant="secondary"
          size="sm"
        >
          {copied ? "Copied!" : "Copy"}
        </Button>
      </div>
      <pre className="mt-2 overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
        <code>{code}</code>
      </pre>
    </div>
  );
}
