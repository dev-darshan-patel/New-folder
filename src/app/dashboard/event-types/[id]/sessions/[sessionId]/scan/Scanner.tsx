"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Camera, X, Check, AlertTriangle, Ban } from "lucide-react";
import { checkInTicketAction } from "@/app/dashboard/actions";
import type { CheckInResult } from "@/lib/checkin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Outcome = CheckInResult | { status: "UNAUTHORIZED" };

// A recent scan pinned in the history strip. Kept in state (not the DB) —
// history's purpose is "did I just admit this person" at-a-glance, not audit.
type Recent = {
  at: Date;
  input: string;
  outcome: Outcome;
};

export default function Scanner({
  sessionId,
  initialCheckedIn,
  capacity,
}: {
  sessionId: string;
  initialCheckedIn: number;
  capacity: number | null;
}) {
  const [manualInput, setManualInput] = useState("");
  const [last, setLast] = useState<Outcome | null>(null);
  const [history, setHistory] = useState<Recent[]>([]);
  const [checkedIn, setCheckedIn] = useState(initialCheckedIn);
  const [submitting, startSubmit] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  // Camera scanning: only enabled after the user opts in (browser permission
  // prompt is jarring on page load, and manual entry is enough on its own).
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraSupported, setCameraSupported] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    // Native BarcodeDetector avoids a scanner-library dependency. It's on
    // Chrome/Android/desktop; iOS Safari lacks it (that path falls back to
    // manual entry, which is what real gates want as their backup anyway).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCameraSupported(
      typeof window !== "undefined" &&
        "BarcodeDetector" in window &&
        !!navigator.mediaDevices?.getUserMedia,
    );
  }, []);

  async function submit(input: string) {
    const cleaned = input.trim();
    if (!cleaned) return;
    startSubmit(async () => {
      const outcome = await checkInTicketAction({ sessionId, code: cleaned });
      setLast(outcome);
      setHistory((h) => [{ at: new Date(), input: cleaned, outcome }, ...h].slice(0, 8));
      // Bump the live count on success. Server sends the fresh count too, but
      // updating locally keeps the UI snappy between scans.
      if (outcome.status === "OK") setCheckedIn(outcome.checkedIn);
      // Blank the input and refocus so back-to-back scans just work.
      setManualInput("");
      inputRef.current?.focus();
    });
  }

  // Camera loop: scan for barcodes every 500ms while open. Same-code repeat
  // suppression prevents a slow "already used" replay while the QR sits in view.
  useEffect(() => {
    if (!cameraOpen) return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    let lastSeen: { code: string; at: number } | null = null;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (cancelled || !videoRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const Detector = (window as any).BarcodeDetector;
        const detector = new Detector({ formats: ["qr_code"] });

        const tick = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            const raw = codes[0]?.rawValue;
            if (raw) {
              const now = Date.now();
              // Ignore a repeat of the same code within 2s so a QR held up
              // doesn't fire "already used" 15 times a second.
              if (!lastSeen || lastSeen.code !== raw || now - lastSeen.at > 2000) {
                lastSeen = { code: raw, at: now };
                submit(raw);
              }
            }
          } catch {
            /* transient detect errors are expected between frames */
          }
          if (!cancelled) setTimeout(tick, 500);
        };
        tick();
      } catch {
        // User denied camera, or the constraint failed. Fall back silently to
        // manual entry — the input is still right there.
        if (!cancelled) setCameraOpen(false);
      }
    })();

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
    // sessionId is stable for the page's lifetime; submit closes over
    // state setters which are stable — no need to re-run the effect on those.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraOpen]);

  return (
    <div className="space-y-4">
      {/* Live count strip. */}
      <div className="rounded-lg border border-border bg-slate-50 px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Checked in
        </p>
        <p className="mt-1 text-2xl font-bold text-foreground">
          {checkedIn}
          {capacity != null && (
            <span className="ml-1 text-base font-normal text-muted-foreground">
              / {capacity}
            </span>
          )}
        </p>
      </div>

      {/* Manual entry — always present, works with no camera, works offline
          for the network round-trip only. */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(manualInput);
        }}
      >
        <label className="text-sm font-medium text-slate-700">
          Scan or type ticket code
        </label>
        <div className="mt-1 flex gap-2">
          <Input
            ref={inputRef}
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            placeholder="tkt-…"
            autoFocus
            autoComplete="off"
            spellCheck={false}
          />
          <Button type="submit" disabled={submitting || !manualInput.trim()}>
            {submitting ? "…" : "Check in"}
          </Button>
        </div>
        {cameraSupported && !cameraOpen && (
          <button
            type="button"
            onClick={() => setCameraOpen(true)}
            className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            <Camera size={14} />
            Use camera
          </button>
        )}
      </form>

      {/* Camera preview, when open. */}
      {cameraOpen && (
        <div className="relative overflow-hidden rounded-lg border border-border bg-black">
          <video
            ref={videoRef}
            playsInline
            muted
            className="block h-64 w-full object-cover"
          />
          <button
            type="button"
            onClick={() => setCameraOpen(false)}
            className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80"
            aria-label="Close camera"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Last-scan outcome pane — the big visual signal for gate staff. */}
      {last && <OutcomePane outcome={last} />}

      {/* Recent scans — glanceable log so staff can double-check they just
          admitted the right person, or see who came in immediately before. */}
      {history.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Recent
          </p>
          <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-border">
            {history.map((r, i) => (
              <li key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="flex items-center gap-2">
                  <StatusDot status={r.outcome.status} />
                  <span className="font-medium text-foreground">
                    {r.outcome.status === "OK" || r.outcome.status === "ALREADY_USED"
                      ? `#${r.outcome.ticket.serial}` +
                        (r.outcome.ticket.attendeeName
                          ? ` · ${r.outcome.ticket.attendeeName}`
                          : "")
                      : shortLabel(r.outcome.status)}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {r.at.toLocaleTimeString()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function OutcomePane({ outcome }: { outcome: Outcome }) {
  if (outcome.status === "OK") {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-4">
        <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-green-600 text-white">
          <Check size={18} />
        </div>
        <div>
          <p className="font-semibold text-green-900">Admitted</p>
          <p className="text-sm text-green-800">
            Ticket #{outcome.ticket.serial}
            {outcome.ticket.attendeeName ? ` · ${outcome.ticket.attendeeName}` : ""}
          </p>
        </div>
      </div>
    );
  }
  if (outcome.status === "ALREADY_USED") {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
        <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-amber-600 text-white">
          <AlertTriangle size={18} />
        </div>
        <div>
          <p className="font-semibold text-amber-900">Already used</p>
          <p className="text-sm text-amber-800">
            Ticket #{outcome.ticket.serial}
            {outcome.ticket.attendeeName ? ` · ${outcome.ticket.attendeeName}` : ""}
            {" · admitted at "}
            {outcome.checkedInAt.toLocaleTimeString()}
          </p>
        </div>
      </div>
    );
  }
  if (outcome.status === "WRONG_EVENT") {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
        <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-red-600 text-white">
          <Ban size={18} />
        </div>
        <div>
          <p className="font-semibold text-red-900">Wrong event</p>
          <p className="text-sm text-red-800">This ticket is for a different session.</p>
        </div>
      </div>
    );
  }
  if (outcome.status === "VOID") {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
        <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-red-600 text-white">
          <Ban size={18} />
        </div>
        <div>
          <p className="font-semibold text-red-900">Void</p>
          <p className="text-sm text-red-800">
            Ticket #{outcome.ticket.serial} was cancelled or refunded.
          </p>
        </div>
      </div>
    );
  }
  if (outcome.status === "UNAUTHORIZED") {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
        <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-red-600 text-white">
          <Ban size={18} />
        </div>
        <div>
          <p className="font-semibold text-red-900">Not authorised</p>
          <p className="text-sm text-red-800">You don&rsquo;t have access to this event.</p>
        </div>
      </div>
    );
  }
  // NOT_FOUND
  return (
    <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
      <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-red-600 text-white">
        <Ban size={18} />
      </div>
      <div>
        <p className="font-semibold text-red-900">Not a valid ticket</p>
        <p className="text-sm text-red-800">
          The scanned code doesn&rsquo;t match any ticket for this event.
        </p>
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: Outcome["status"] }) {
  const color =
    status === "OK"
      ? "bg-green-500"
      : status === "ALREADY_USED"
        ? "bg-amber-500"
        : "bg-red-500";
  return <span className={`inline-block h-2 w-2 rounded-full ${color}`} aria-hidden />;
}

function shortLabel(status: Outcome["status"]): string {
  switch (status) {
    case "WRONG_EVENT":
      return "Wrong event";
    case "VOID":
      return "Void";
    case "UNAUTHORIZED":
      return "Not authorised";
    case "NOT_FOUND":
      return "Not found";
    default:
      return status;
  }
}
