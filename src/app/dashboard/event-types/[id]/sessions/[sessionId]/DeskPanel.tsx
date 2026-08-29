"use client";

import { useState, useTransition } from "react";
import { manualRegisterAction, updateTicketSerialAction, resendTicketEmailAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

type Tier = { id: string; name: string; seatsLeft: number | null };

// The organiser's at-the-door panel (Phase 6): register a walk-in, and fix a
// ticket number. Deliberately kept to the two things someone standing at a
// desk with a queue in front of them actually needs.
export default function DeskPanel({
  sessionId,
  tiers,
  canManualRegister,
}: {
  sessionId: string;
  tiers: Tier[];
  canManualRegister: boolean;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [qty, setQty] = useState("1");
  const [tierId, setTierId] = useState(tiers.find((t) => t.seatsLeft !== 0)?.id ?? "");
  const [notify, setNotify] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  if (!canManualRegister) return null;

  function register() {
    setMsg(null);
    start(async () => {
      const res = await manualRegisterAction({
        sessionId,
        name,
        email,
        quantity: Number(qty),
        tierId: tierId || null,
        notify,
      });
      if (res.ok) {
        setMsg({ ok: true, text: res.message ?? "Registered." });
        // Clear the person, keep the category and quantity: a desk registers
        // one attendee after another into the same category.
        setName("");
        setEmail("");
      } else {
        setMsg({ ok: false, text: res.error });
      }
    });
  }

  return (
    <div className="mt-6 rounded-lg border border-border bg-slate-50 p-4">
      <h2 className="text-sm font-semibold text-slate-700">Register at the door</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Add a walk-in or cash sale. Email is optional — leave it blank and hand them the ticket
        on screen instead.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="text-xs font-medium text-slate-600">Attendee name</span>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
            className="mt-1 w-52"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-600">Email (optional)</span>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            className="mt-1 w-56"
          />
        </label>
        {tiers.length > 0 && (
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Category</span>
            <NativeSelect
              value={tierId}
              onChange={(e) => setTierId(e.target.value)}
              className="mt-1 w-44"
            >
              {tiers.map((t) => (
                <option key={t.id} value={t.id} disabled={t.seatsLeft === 0}>
                  {t.name}
                  {t.seatsLeft === null
                    ? ""
                    : t.seatsLeft === 0
                      ? " — sold out"
                      : ` — ${t.seatsLeft} left`}
                </option>
              ))}
            </NativeSelect>
          </label>
        )}
        <label className="block">
          <span className="text-xs font-medium text-slate-600">Tickets</span>
          <Input
            type="number"
            min={1}
            max={50}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="mt-1 w-20"
          />
        </label>
        <label className="flex items-center gap-1.5 pb-2 text-xs text-slate-700">
          <input
            type="checkbox"
            checked={notify}
            onChange={(e) => setNotify(e.target.checked)}
            className="h-4 w-4 rounded border-input"
          />
          Email the ticket
        </label>
        <Button type="button" onClick={register} disabled={pending || !name.trim()}>
          {pending ? "Registering…" : "Register"}
        </Button>
      </div>
      {msg && (
        <p
          className={`mt-3 rounded-lg px-3 py-2 text-sm ${
            msg.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"
          }`}
        >
          {msg.text}
        </p>
      )}
    </div>
  );
}

// Inline editor for one ticket's printed number, rendered next to it on the
// roster. Separate component so the roster stays a server component and only
// this control ships JS.
export function SerialEditor({ ticketId, serial }: { ticketId: string; serial: number }) {
  const [value, setValue] = useState(String(serial));
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        title="Change ticket number"
        className="underline decoration-dotted underline-offset-2 hover:text-foreground"
      >
        #{serial}
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <input
        type="number"
        min={1}
        value={value}
        autoFocus
        onChange={(e) => setValue(e.target.value)}
        className="w-20 rounded border border-input px-1 py-0.5 text-xs"
      />
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await updateTicketSerialAction({ ticketId, serial: Number(value) });
            if (res.ok) setEditing(false);
            else setError(res.error);
          })
        }
        className="font-semibold text-primary"
      >
        {pending ? "…" : "Save"}
      </button>
      <button
        type="button"
        onClick={() => {
          setEditing(false);
          setValue(String(serial));
          setError(null);
        }}
        className="text-muted-foreground"
      >
        Cancel
      </button>
      {error && <span className="text-red-600">{error}</span>}
    </span>
  );
}

// "They lost the email" — re-send the ticket links for one order.
export function ResendButton({ bookingId }: { bookingId: string }) {
  const [state, setState] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await resendTicketEmailAction({ bookingId });
          setState(res.ok ? "Sent" : res.error);
        })
      }
      className="text-xs font-medium text-primary hover:underline disabled:opacity-60"
    >
      {pending ? "Sending…" : (state ?? "Resend tickets")}
    </button>
  );
}
