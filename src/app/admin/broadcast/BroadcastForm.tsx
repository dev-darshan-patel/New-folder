"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { sendBroadcastAction, type BroadcastState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="mt-2">
      {pending ? "Sending… this can take a while" : "Send broadcast"}
    </Button>
  );
}

export function BroadcastForm({ recipientCount }: { recipientCount: number }) {
  const [state, formAction] = useActionState<BroadcastState, FormData>(
    sendBroadcastAction,
    null,
  );

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Compose broadcast</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Subject</span>
            <Input
              name="subject"
              required
              placeholder="An update from the team"
              className="mt-1"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Message</span>
            <Textarea
              name="body"
              required
              rows={8}
              placeholder={"What's new…"}
              className="mt-1"
            />
            <span className="mt-1 block text-xs text-slate-400">
              Each email starts with &quot;Hi {"{name}"},&quot; automatically.
            </span>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">
              Type SEND to confirm
            </span>
            <Input
              name="confirm"
              required
              placeholder="SEND"
              autoComplete="off"
              className="mt-1 max-w-xs"
            />
            <span className="mt-1 block text-xs text-slate-400">
              This will email {recipientCount}{" "}
              {recipientCount === 1 ? "business" : "businesses"} immediately.
            </span>
          </label>

          {state && "error" in state && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
              {state.error}
            </p>
          )}
          {state && "ok" in state && (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700">
              Sent to {state.sent} {state.sent === 1 ? "business" : "businesses"} ({state.failed}{" "}
              failed).
            </p>
          )}

          <SubmitButton />
        </form>
      </CardContent>
    </Card>
  );
}
