"use client";

import { useActionState, useState } from "react";
import { wrapHtml } from "@/lib/email-render";
import { updateEmailBrandingAction, type TemplateFormState } from "./actions";
import { Button } from "@/components/ui/button";

type Initial = {
  emailBrandName: string;
  emailLogoUrl: string;
  emailAccentColor: string;
  emailFooterText: string;
  emailSupportUrl: string;
};

const field =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";

export default function BrandingEditor({ initial }: { initial: Initial }) {
  const [state, formAction, pending] = useActionState<TemplateFormState, FormData>(
    updateEmailBrandingAction,
    null,
  );

  const [name, setName] = useState(initial.emailBrandName);
  const [logo, setLogo] = useState(initial.emailLogoUrl);
  const [accent, setAccent] = useState(initial.emailAccentColor || "#4f46e5");
  const [footer, setFooter] = useState(initial.emailFooterText);
  const [support, setSupport] = useState(initial.emailSupportUrl);

  const previewHtml = wrapHtml(
    `<p style="margin:0 0 16px;">Hi Alex Carter,</p>
     <p style="margin:0;">This is a preview of how your branded emails look.</p>`,
    {
      name: name || null,
      logoUrl: logo || null,
      accentColor: accent || null,
      footerText: footer || null,
      supportUrl: support || null,
    },
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      <form action={formAction} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700">Brand name</label>
          <input
            name="emailBrandName"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Booking"
            title="Brand name shown in the email header"
            className={field}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700">Logo URL (optional)</label>
          <input
            name="emailLogoUrl"
            value={logo}
            onChange={(e) => setLogo(e.target.value)}
            placeholder="https://yoursite.com/logo.png"
            title="Logo image URL — replaces the text header when set"
            className={field}
          />
          <p className="text-xs text-slate-400">
            When set, the logo image replaces the text brand name in the header.
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700">Accent color</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={accent}
              onChange={(e) => setAccent(e.target.value)}
              title="Pick the accent color"
              className="h-9 w-12 cursor-pointer rounded border border-slate-300"
            />
            <input
              name="emailAccentColor"
              value={accent}
              onChange={(e) => setAccent(e.target.value)}
              placeholder="#4f46e5"
              title="Accent color hex value"
              className={`${field} max-w-[140px]`}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700">Footer text</label>
          <textarea
            name="emailFooterText"
            value={footer}
            onChange={(e) => setFooter(e.target.value)}
            rows={2}
            placeholder="You're receiving this because you have an account with us."
            title="Footer text shown at the bottom of every email"
            className={field}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700">Support URL (optional)</label>
          <input
            name="emailSupportUrl"
            value={support}
            onChange={(e) => setSupport(e.target.value)}
            placeholder="https://yoursite.com/support"
            title="Support link shown in the footer"
            className={field}
          />
        </div>

        {state && "error" in state && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
        )}
        {state && "ok" in state && (
          <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{state.message}</p>
        )}

        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save branding"}
        </Button>
      </form>

      <div>
        <p className="text-sm font-semibold text-slate-700">Preview</p>
        <div className="mt-2 rounded-xl border border-slate-200 bg-slate-100 p-3">
          <iframe
            title="Branding preview"
            srcDoc={previewHtml}
            className="h-[380px] w-full rounded-lg border border-slate-200 bg-white"
          />
        </div>
      </div>
    </div>
  );
}
