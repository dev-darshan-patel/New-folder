"use client";

import { useActionState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { createUserByAdminAction, type AdminUserFormState } from "../../actions";

const INPUT_CLASSES =
  "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";

export default function CreateUserForm({
  plans,
}: {
  plans: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<AdminUserFormState, FormData>(
    createUserByAdminAction,
    null,
  );
  const tzRef = useRef<HTMLSelectElement>(null);

  const timezones = useMemo(() => {
    try {
      return Intl.supportedValuesOf("timeZone");
    } catch {
      return ["UTC"];
    }
  }, []);

  useEffect(() => {
    if (tzRef.current) {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (timezones.includes(detected)) tzRef.current.value = detected;
    }
  }, [timezones]);

  useEffect(() => {
    if (state && "ok" in state && state.ok && state.userId) {
      router.push(`/admin/users/${state.userId}`);
    }
  }, [state, router]);

  return (
    <form
      action={formAction}
      className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-6"
    >
      <label className="block">
        <span className="text-sm font-medium text-slate-700">Name</span>
        <input name="name" type="text" required autoComplete="name" className={INPUT_CLASSES} />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Business name</span>
        <input name="businessName" type="text" required className={INPUT_CLASSES} />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Email</span>
        <input name="email" type="email" required autoComplete="email" className={INPUT_CLASSES} />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Password</span>
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className={INPUT_CLASSES}
        />
        <span className="mt-1 block text-xs text-slate-400">At least 8 characters</span>
      </label>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Timezone</span>
        <select ref={tzRef} name="timezone" defaultValue="UTC" className={INPUT_CLASSES}>
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
          placeholder="+1 555 010 1234"
          className={INPUT_CLASSES}
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Plan</span>
          <select name="plan" defaultValue="FREE" className={INPUT_CLASSES}>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Admin role</span>
          <select name="adminRole" defaultValue="" className={INPUT_CLASSES}>
            <option value="">None</option>
            <option value="READ_ONLY">Read only</option>
            <option value="SUPPORT">Support</option>
            <option value="SUPER_ADMIN">Super admin</option>
          </select>
        </label>
      </div>

      {state && "error" in state && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}
      {state && "ok" in state && state.ok && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {state.message} Redirecting…
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:opacity-60"
      >
        {pending ? "Creating…" : "Create user"}
      </button>
    </form>
  );
}
