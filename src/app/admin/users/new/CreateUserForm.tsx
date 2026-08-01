"use client";

import { useActionState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { createUserByAdminAction, type AdminUserFormState } from "../../actions";
import { Card, CardContent } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

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
    <Card className="mt-6">
    <CardContent className="space-y-4 p-6">
    <form action={formAction} className="space-y-4">
      <label className="block">
        <span className="text-sm font-medium text-slate-700">Name</span>
        <Input name="name" type="text" required autoComplete="name" />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Business name</span>
        <Input name="businessName" type="text" required />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Email</span>
        <Input name="email" type="email" required autoComplete="email" />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Password</span>
        <Input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
        />
        <span className="mt-1 block text-xs text-slate-400">At least 8 characters</span>
      </label>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Timezone</span>
        <NativeSelect ref={tzRef} name="timezone" defaultValue="UTC">
          {timezones.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </NativeSelect>
      </label>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">
          Mobile <span className="text-slate-400">(optional)</span>
        </span>
        <Input
          name="mobile"
          type="text"
          placeholder="+1 555 010 1234"
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Plan</span>
          <NativeSelect name="plan" defaultValue="FREE">
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Admin role</span>
          <NativeSelect name="adminRole" defaultValue="">
            <option value="">None</option>
            <option value="READ_ONLY">Read only</option>
            <option value="SUPPORT">Support</option>
            <option value="SUPER_ADMIN">Super admin</option>
          </NativeSelect>
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

      <SubmitButton disabled={pending} className="w-full">
        {pending ? "Creating…" : "Create user"}
      </SubmitButton>
    </form>
    </CardContent>
    </Card>
  );
}
