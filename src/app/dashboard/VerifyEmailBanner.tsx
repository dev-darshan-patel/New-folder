"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { resendVerificationAction } from "./actions";

// Persistent nag shown until the user verifies their email. The server layout
// decides whether to render this at all.
export default function VerifyEmailBanner() {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  function resend() {
    startTransition(async () => {
      const result = await resendVerificationAction();
      if (result.ok) {
        setStatus("sent");
        setError(null);
      } else {
        setStatus("error");
        setError(result.error ?? "Something went wrong.");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-amber-200 bg-amber-50 px-6 py-2 text-sm text-amber-800">
      <span>Please verify your email address — check your inbox.</span>
      {status === "sent" ? (
        <span className="font-medium">Sent!</span>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={resend}
          disabled={pending}
          className="border-amber-300 bg-white text-amber-800 hover:bg-amber-100"
        >
          {pending ? "Sending…" : "Resend email"}
        </Button>
      )}
      {status === "error" && error && <span className="text-red-700">{error}</span>}
    </div>
  );
}
