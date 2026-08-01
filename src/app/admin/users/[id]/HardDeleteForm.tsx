"use client";

import { useState } from "react";
import { hardDeleteUserAction } from "../../actions";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";

export default function HardDeleteForm({ userId, slug }: { userId: string; slug: string }) {
  const [confirmText, setConfirmText] = useState("");
  const matches = confirmText === slug;

  return (
    <form action={hardDeleteUserAction} className="space-y-2">
      <input type="hidden" name="userId" value={userId} />
      <p className="text-xs text-muted-foreground">
        Type <code className="rounded bg-muted px-1">{slug}</code> to permanently delete this
        account and all its data.
      </p>
      <div className="flex gap-2">
        <Input
          name="confirmSlug"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={slug}
          className="flex-1 border-red-300 focus-visible:border-red-500"
        />
        <SubmitButton variant="destructive" disabled={!matches}>
          Delete permanently
        </SubmitButton>
      </div>
    </form>
  );
}
