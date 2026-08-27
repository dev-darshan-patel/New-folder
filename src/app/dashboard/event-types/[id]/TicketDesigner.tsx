"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { Trash2, Upload, Plus } from "lucide-react";
import { saveTicketLayoutAction } from "../../actions";
import {
  TICKET_FIELD_KEYS,
  TICKET_FIELD_LABELS,
  parseTicketLayout,
  sizeBounds,
  type TicketField,
  type TicketFieldKey,
} from "@/lib/ticket-template";
import TicketArtwork, { type TicketFieldValues } from "@/components/TicketArtwork";
import { Button } from "@/components/ui/button";

// Sample values so the tenant is arranging a ticket that looks like a real
// one — placing fields against "#42 / Aarav Shah / VIP" is a very different
// judgement than placing them against "Ticket number / Attendee name".
const SAMPLE: TicketFieldValues = {
  serial: "#42",
  attendeeName: "Aarav Shah",
  tierName: "VIP",
  eventTitle: "Navratri Garba Night",
  eventDate: "Saturday, October 3, 2026 at 7:00 PM",
};

export default function TicketDesigner({
  eventTypeId,
  initialArtworkUrl,
  initialLayout,
  sampleQrDataUrl,
}: {
  eventTypeId: string;
  initialArtworkUrl: string | null;
  initialLayout: string | null;
  sampleQrDataUrl: string;
}) {
  const [artworkUrl, setArtworkUrl] = useState(initialArtworkUrl);
  const [fields, setFields] = useState<TicketField[]>(() => parseTicketLayout(initialLayout));
  const [selected, setSelected] = useState<TicketFieldKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, startSave] = useTransition();
  const boxRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const placed = new Set(fields.map((f) => f.key));
  const unplaced = TICKET_FIELD_KEYS.filter((k) => !placed.has(k));

  function markDirty() {
    setSaved(false);
  }

  function updateField(key: TicketFieldKey, patch: Partial<TicketField>) {
    setFields((prev) => prev.map((f) => (f.key === key ? { ...f, ...patch } : f)));
    markDirty();
  }

  // Dragging: pointer events (not HTML5 drag-and-drop) because we need
  // continuous positioning against the artwork box, and pointer events work
  // identically for mouse, pen and touch with no drag-image ghosting.
  const onPointerDown = useCallback(
    (e: React.PointerEvent, key: TicketFieldKey) => {
      e.preventDefault();
      setSelected(key);
      const box = boxRef.current;
      if (!box) return;
      // No setPointerCapture: the move/up listeners live on `window`, which
      // already keeps the drag alive when the pointer leaves the handle, and
      // capture on a synthetic/relinquished pointer can throw and abort the
      // drag before it starts.

      const move = (ev: PointerEvent) => {
        const rect = box.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        const x = ((ev.clientX - rect.left) / rect.width) * 100;
        const y = ((ev.clientY - rect.top) / rect.height) * 100;
        // Clamping here matches the server's own clamp, so what you can drag
        // to is exactly what can be stored — no snap-back surprise on save.
        setFields((prev) =>
          prev.map((f) =>
            f.key === key
              ? {
                  ...f,
                  x: Math.round(Math.min(105, Math.max(-5, x)) * 100) / 100,
                  y: Math.round(Math.min(105, Math.max(-5, y)) * 100) / 100,
                }
              : f,
          ),
        );
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        markDirty();
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [],
  );

  // Keyboard nudging: dragging can't hit an exact value, and this is also the
  // only way to place a field without a pointer at all.
  function onKeyDown(e: React.KeyboardEvent, key: TicketFieldKey) {
    const step = e.shiftKey ? 5 : 0.5;
    const deltas: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const delta = deltas[e.key];
    if (!delta) return;
    e.preventDefault();
    const field = fields.find((f) => f.key === key);
    if (!field) return;
    updateField(key, {
      x: Math.round(Math.min(105, Math.max(-5, field.x + delta[0])) * 100) / 100,
      y: Math.round(Math.min(105, Math.max(-5, field.y + delta[1])) * 100) / 100,
    });
  }

  async function onUpload(file: File) {
    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("eventTypeId", eventTypeId);
      const res = await fetch("/api/upload/ticket-artwork", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Upload failed.");
        return;
      }
      setArtworkUrl(data.url);
      // The server seeds a starting layout on first upload; adopt whatever it
      // stored so the client and DB agree without a refetch.
      setFields(parseTicketLayout(data.layout));
      setSaved(true);
    } catch {
      setError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function onRemoveArtwork() {
    setError(null);
    setUploading(true);
    try {
      const res = await fetch(`/api/upload/ticket-artwork?eventTypeId=${eventTypeId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Couldn't remove the artwork.");
        return;
      }
      setArtworkUrl(null);
      setFields([]);
      setSelected(null);
    } catch {
      setError("Couldn't remove the artwork. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  function onSave() {
    setError(null);
    startSave(async () => {
      const res = await saveTicketLayoutAction({ eventTypeId, fields });
      if (res.ok) setSaved(true);
      else setError(res.error);
    });
  }

  if (!artworkUrl) {
    return (
      <div className="rounded-lg border border-dashed border-input p-6 text-center">
        <p className="text-sm font-medium text-foreground">Custom ticket design</p>
        <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
          Upload your ticket artwork (a rectangular image), then drag the ticket number, attendee
          name, category and QR code onto it. Without artwork, tickets use the built-in design.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUpload(f);
            e.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="outline"
          className="mt-4"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
        >
          <Upload size={14} className="mr-1.5" />
          {uploading ? "Uploading…" : "Upload artwork"}
        </Button>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  const selectedField = fields.find((f) => f.key === selected) ?? null;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_16rem]">
        {/* Canvas. */}
        <div>
          <div ref={boxRef} className="relative select-none rounded-lg border border-border">
            <TicketArtwork
              artworkUrl={artworkUrl}
              fields={fields}
              values={SAMPLE}
              qrDataUrl={sampleQrDataUrl}
            />
            {/* Drag handles sit in their own overlay, mirroring each field's
                position, so the preview underneath stays pixel-identical to
                what the attendee will actually see — no editing chrome baked
                into the rendered ticket. */}
            <div className="absolute inset-0">
              {fields.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onPointerDown={(e) => onPointerDown(e, f.key)}
                  onKeyDown={(e) => onKeyDown(e, f.key)}
                  onClick={() => setSelected(f.key)}
                  aria-label={`Move ${TICKET_FIELD_LABELS[f.key]}`}
                  style={{ left: `${f.x}%`, top: `${f.y}%` }}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 cursor-move rounded border-2 border-dashed bg-primary/5 px-6 py-3 text-[0px] transition-colors ${
                    selected === f.key
                      ? "border-primary"
                      : "border-transparent hover:border-primary/40"
                  }`}
                >
                  {TICKET_FIELD_LABELS[f.key]}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Drag a field to move it. Click to select, then use arrow keys for fine control (hold
            Shift for bigger steps).
          </p>
        </div>

        {/* Controls. */}
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Fields on the ticket
            </p>
            <ul className="mt-2 space-y-1">
              {fields.map((f) => (
                <li key={f.key} className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setSelected(f.key)}
                    className={`flex-1 rounded px-2 py-1 text-left text-sm ${
                      selected === f.key
                        ? "bg-primary/10 font-medium text-primary"
                        : "text-slate-700 hover:bg-muted"
                    }`}
                  >
                    {TICKET_FIELD_LABELS[f.key]}
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${TICKET_FIELD_LABELS[f.key]}`}
                    onClick={() => {
                      setFields((prev) => prev.filter((x) => x.key !== f.key));
                      if (selected === f.key) setSelected(null);
                      markDirty();
                    }}
                    className="rounded p-1 text-muted-foreground hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
              {fields.length === 0 && (
                <li className="text-sm text-muted-foreground">
                  No fields yet — add one below.
                </li>
              )}
            </ul>
          </div>

          {unplaced.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Add a field
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {unplaced.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      // New fields land dead centre — always visible, always
                      // draggable from there, never hidden off-artwork.
                      setFields((prev) => [
                        ...prev,
                        {
                          key,
                          x: 50,
                          y: 50,
                          size: key === "qr" ? 26 : 5,
                          color: "dark",
                        },
                      ]);
                      setSelected(key);
                      markDirty();
                    }}
                    className="inline-flex items-center gap-1 rounded border border-input px-2 py-1 text-xs font-medium text-slate-700 hover:bg-muted"
                  >
                    <Plus size={11} />
                    {TICKET_FIELD_LABELS[key]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {selectedField && (
            <div className="space-y-3 rounded-lg border border-border bg-slate-50 p-3">
              <p className="text-sm font-medium text-foreground">
                {TICKET_FIELD_LABELS[selectedField.key]}
              </p>
              <label className="block text-xs">
                <span className="font-medium text-slate-600">
                  {selectedField.key === "qr" ? "Size" : "Text size"}
                </span>
                <input
                  type="range"
                  min={sizeBounds(selectedField.key).min}
                  max={sizeBounds(selectedField.key).max}
                  step={0.5}
                  value={selectedField.size}
                  onChange={(e) =>
                    updateField(selectedField.key, { size: Number(e.target.value) })
                  }
                  className="mt-1 w-full"
                />
              </label>
              {selectedField.key !== "qr" && (
                <div className="text-xs">
                  <span className="font-medium text-slate-600">Text color</span>
                  <div className="mt-1 flex gap-1.5">
                    {(["dark", "light"] as const).map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => updateField(selectedField.key, { color: c })}
                        className={`flex-1 rounded border px-2 py-1 capitalize ${
                          selectedField.color === c
                            ? "border-primary bg-primary/10 font-medium text-primary"
                            : "border-input text-slate-700 hover:bg-muted"
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={onSave} disabled={saving}>
          {saving ? "Saving…" : saved ? "Saved" : "Save ticket design"}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUpload(f);
            e.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="outline"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
        >
          <Upload size={14} className="mr-1.5" />
          {uploading ? "Uploading…" : "Replace artwork"}
        </Button>
        <Button
          type="button"
          variant="link"
          disabled={uploading}
          onClick={onRemoveArtwork}
          className="text-red-600"
        >
          Remove artwork
        </Button>
      </div>
    </div>
  );
}
