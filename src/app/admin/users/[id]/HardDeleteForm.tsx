"use client";

import { useState } from "react";
import { hardDeleteUserAction } from "../../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function HardDeleteForm({ userId, slug }: { userId: string; slug: string }) {
  const [confirmText, setConfirmText] = useState("");
  const matches = confirmText === slug;

  return (
    <form action={hardDeleteUserAction} className="space-y-2">
      <input type="hidden" name="userId" value={userId} />
      <p className="text-xs text-slate-500">
        Type <code className="rounded bg-slate-100 px-1">{slug}</code> to permanently delete this
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
        <Button type="submit" variant="destructive" disabled={!matches}>
          Delete permanently
        </Button>
      </div>
    </form>
  );
}
