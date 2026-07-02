"use client";

import { useState } from "react";
import { FONTS } from "@/lib/branding";
import { updateBrandingAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

type Initial = {
  brandColor: string;
  brandFont: string;
  logoUrl: string;
  welcomeMessage: string;
  businessName: string;
};

export default function BrandingForm({
  initial,
  disabled,
}: {
  initial: Initial;
  disabled: boolean;
}) {
  const [color, setColor] = useState(initial.brandColor);
  const [font, setFont] = useState(initial.brandFont);
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl);
  const [welcome, setWelcome] = useState(initial.welcomeMessage);

  const stack = (FONTS[font] ?? FONTS.Geist).stack;

  return (
    <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_1fr]">
      <form action={updateBrandingAction} className="space-y-5">
        <fieldset disabled={disabled} className="space-y-5 disabled:opacity-60">
          <div className="space-y-2">
            <Label>Accent color</Label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-10 w-14 cursor-pointer rounded border border-slate-300"
              />
              <Input
                name="brandColor"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                pattern="#[0-9a-fA-F]{6}"
                className="w-32"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Font</Label>
            <NativeSelect
              name="brandFont"
              value={font}
              onChange={(e) => setFont(e.target.value)}
            >
              {Object.entries(FONTS).map(([key, f]) => (
                <option key={key} value={key}>
                  {f.label}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="space-y-2">
            <Label>Logo URL (optional)</Label>
            <Input
              name="logoUrl"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://yoursite.com/logo.png"
            />
          </div>

          <div className="space-y-2">
            <Label>Welcome message (optional)</Label>
            <Textarea
              name="welcomeMessage"
              value={welcome}
              onChange={(e) => setWelcome(e.target.value)}
              rows={2}
              maxLength={280}
              placeholder="Book a time that works for you."
            />
          </div>

          <Button type="submit">
            Save branding
          </Button>
        </fieldset>
      </form>

      {/* Live preview */}
      <div>
        <p className="text-sm font-medium text-slate-700">Live preview</p>
        <div
          className="mt-2 rounded-2xl border border-slate-200 bg-white p-6"
          style={{ fontFamily: stack }}
        >
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="mb-3 h-10 w-auto object-contain" />
          ) : (
            <div
              className="mb-3 flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold text-white"
              style={{ backgroundColor: color }}
            >
              {initial.businessName.charAt(0).toUpperCase()}
            </div>
          )}
          <p className="text-sm font-medium" style={{ color }}>
            {initial.businessName}
          </p>
          <h3 className="mt-1 text-xl font-bold text-slate-900">
            30 Minute Meeting
          </h3>
          {welcome && <p className="mt-2 text-sm text-slate-600">{welcome}</p>}
          <div className="mt-4 flex gap-2">
            <span
              className="rounded-lg px-3 py-2 text-sm font-medium text-white"
              style={{ backgroundColor: color }}
            >
              09:00
            </span>
            <span
              className="rounded-lg border px-3 py-2 text-sm font-medium"
              style={{ color, borderColor: color }}
            >
              09:30
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
