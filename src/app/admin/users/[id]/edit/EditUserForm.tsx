"use client";

import { useActionState, useMemo, useState } from "react";
import { updateUserByAdminAction, type AdminUserFormState } from "../../../actions";

const INPUT_CLASSES =
  "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";

export type EditUserInitial = {
  id: string;
  name: string;
  businessName: string;
  email: string;
  slug: string;
  timezone: string;
  mobile: string;
};

export default function EditUserForm({ initial }: { initial: EditUserInitial }) {
  const [state, formAction, pending] = useActionState<AdminUserFormState, FormData>(
    updateUserByAdminAction,
    null,
  );
  const [slug, setSlug] = useState(initial.slug);

  const timezones = useMemo(() => {
    try {
      return Intl.supportedValuesOf("timeZone");
    } catch {
      return [initial.timezone || "UTC"];
    }
  }, [initial.timezone]);

  return (
    <form
      action={formAction}
      className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-6"
    >
      <input type="hidden" name="id" value={initial.id} />

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Name</span>
        <input
          name="name"
          type="text"
          required
          defaultValue={initial.name}
          className={INPUT_CLASSES}
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Business name</span>
        <input
          name="businessName"
          type="text"
          required
          defaultValue={initial.businessName}
          className={INPUT_CLASSES}
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Email</span>
        <input
          name="email"
          type="email"
          required
          defaultValue={initial.email}
          className={INPUT_CLASSES}
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">URL slug</span>
        <input
          name="slug"
          type="text"
          required
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          className={INPUT_CLASSES}
        />
        <span className="mt-1 block text-xs text-slate-400">
          Public booking link: yoursite.com/{slug || "your-slug"}
        </span>
      </label>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Timezone</span>
        <select
          name="timezone"
          defaultValue={initial.timezone}
          className={INPUT_CLASSES}
        >
          {timezones.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">
          Mobile <span className="text-slate-400">(optional)</span>
        </span>
        <input
          name="mobile"
          type="text"
          defaultValue={initial.mobile}
          placeholder="+1 555 010 1234"
          className={INPUT_CLASSES}
        />
      </label>

      {state && "error" in state && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}
      {state && "ok" in state && state.ok && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
