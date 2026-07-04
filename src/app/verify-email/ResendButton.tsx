"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { resendVerificationAction } from "@/app/dashboard/actions";

// Resend the verification email from the "check your inbox" pending page.
export default function ResendButton() {
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
    <div className="mt-4 flex flex-wrap items-center gap-3">
      {status === "sent" ? (
        <span className="text-sm font-medium text-green-700">
          Sent! Check your inbox.
        </span>
      ) : (
        <Button type="button" onClick={resend} disabled={pending}>
          {pending ? "Sending…" : "Resend verification email"}
        </Button>
      )}
      {status === "error" && error && (
        <span className="text-sm text-red-700">{error}</span>
      )}
    </div>
  );
}
