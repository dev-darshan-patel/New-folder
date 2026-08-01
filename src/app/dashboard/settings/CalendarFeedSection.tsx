"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { regenerateCalendarFeedTokenAction } from "./actions";

function FeedUrl({ label, url }: { label: string; url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard may be unavailable (insecure origin, permissions) — the URL
      // is still selectable by hand, so fail quietly.
    }
  }

  return (
    <div className="mt-3">
      <p className="text-xs font-medium text-slate-700">{label}</p>
      <div className="mt-1 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-slate-50 px-3 py-2 text-xs text-slate-600">
          {url}
        </code>
        <Button type="button" size="sm" variant="outline" onClick={copy} className="shrink-0">
          {copied ? "Copied!" : "Copy"}
        </Button>
      </div>
    </div>
  );
}

export default function CalendarFeedSection({
  feedBase,
  eventTypes,
}: {
  feedBase: string;
  eventTypes: { id: string; title: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const [showPerType, setShowPerType] = useState(false);

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center gap-2">
          <CalendarClock size={18} className="text-muted-foreground" />
          <h2 className="font-semibold text-foreground">Calendar subscription</h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Paste this link into Google Calendar, Apple Calendar or Outlook to see your
          bookings there automatically. It&apos;s read-only and updates on its own —
          you don&apos;t need to connect an account.
        </p>

        <FeedUrl label="All bookings" url={feedBase} />

        {eventTypes.length > 0 && (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setShowPerType((v) => !v)}
              className="text-xs font-medium text-primary hover:underline"
            >
              {showPerType ? "Hide" : "Show"} one link per event type
            </button>
            {showPerType && (
              <div className="mt-1">
                {eventTypes.map((et) => (
                  <FeedUrl
                    key={et.id}
                    label={et.title}
                    url={`${feedBase}?eventType=${et.id}`}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                await regenerateCalendarFeedTokenAction();
                toast.success("New link generated. Old subscriptions will stop updating.");
              });
            }}
          >
            {pending ? "Generating…" : "Generate new link"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Anyone with this link can see your booking times. Generate a new one to
            revoke access.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
