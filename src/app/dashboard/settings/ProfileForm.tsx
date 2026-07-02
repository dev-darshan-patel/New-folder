"use client";

import { useActionState, useState } from "react";
import { updateProfileAction, type SettingsState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";

type Initial = {
  name: string;
  businessName: string;
  mobile: string | null;
  slug: string;
  timezone: string;
};

const TIMEZONES: string[] =
  typeof Intl.supportedValuesOf === "function"
    ? Intl.supportedValuesOf("timeZone")
    : ["UTC"];

export default function ProfileForm({ initial }: { initial: Initial }) {
  const [state, formAction, pending] = useActionState<SettingsState, FormData>(
    updateProfileAction,
    null,
  );
  const [slug, setSlug] = useState(initial.slug);

  return (
    <form action={formAction} className="mt-5 space-y-5">
      <div className="space-y-2">
        <Label htmlFor="name">Your name</Label>
        <Input
          id="name"
          name="name"
          defaultValue={initial.name}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="businessName">Business name</Label>
        <Input
          id="businessName"
          name="businessName"
          defaultValue={initial.businessName}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="mobile">Mobile number</Label>
        <Input
          id="mobile"
          name="mobile"
          type="tel"
          defaultValue={initial.mobile ?? ""}
        />
        <span className="text-xs text-slate-400">Optional.</span>
      </div>

      <div className="space-y-2">
        <Label htmlFor="slug">Booking URL handle</Label>
        <Input
          id="slug"
          name="slug"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          required
        />
        <span className="text-xs text-slate-400 block">
          Your booking page:{" "}
          <span className="font-medium text-slate-600">
            yoursite.com/{slug || "your-handle"}
          </span>
        </span>
      </div>

      <div className="space-y-2">
        <Label htmlFor="timezone">Timezone</Label>
        <NativeSelect
          id="timezone"
          name="timezone"
          defaultValue={initial.timezone}
        >
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </NativeSelect>
      </div>

      {state && "error" in state && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}
      {state && "ok" in state && (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
          {state.message}
        </p>
      )}

      <Button
        type="submit"
        disabled={pending}
      >
        {pending ? "Saving…" : "Save profile"}
      </Button>
    </form>
  );
}
