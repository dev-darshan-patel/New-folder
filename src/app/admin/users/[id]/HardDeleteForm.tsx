"use client";

import { useState } from "react";
import { hardDeleteUserAction } from "../../actions";

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
        <input
          name="confirmSlug"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={slug}
          className="flex-1 rounded-lg border border-red-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-red-500"
        />
        <button
          type="submit"
          disabled={!matches}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Delete permanently
        </button>
      </div>
    </form>
  );
}
