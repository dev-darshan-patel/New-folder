import type { User } from "@prisma/client";
import { getPlanConfig } from "@/lib/plans";

export const DEFAULT_BRAND_COLOR = "#4f46e5"; // indigo-600
export const DEFAULT_BRAND_FONT = "Geist";

// Curated font choices. `google` is the Google Fonts family param (omitted for
// the default system stack). `stack` is the CSS font-family applied.
export const FONTS: Record<string, { label: string; stack: string; google?: string }> = {
  Geist: { label: "Geist (default)", stack: "var(--font-geist-sans), system-ui, sans-serif" },
  Inter: { label: "Inter", stack: "'Inter', system-ui, sans-serif", google: "Inter:wght@400;500;600;700" },
  Poppins: { label: "Poppins", stack: "'Poppins', system-ui, sans-serif", google: "Poppins:wght@400;500;600;700" },
  Roboto: { label: "Roboto", stack: "'Roboto', system-ui, sans-serif", google: "Roboto:wght@400;500;700" },
  Montserrat: { label: "Montserrat", stack: "'Montserrat', system-ui, sans-serif", google: "Montserrat:wght@400;500;600;700" },
  Lora: { label: "Lora (serif)", stack: "'Lora', Georgia, serif", google: "Lora:wght@400;500;600;700" },
};

export type Branding = {
  color: string;
  fontKey: string;
  fontStack: string;
  googleFontHref: string | null;
  logoUrl: string | null;
  welcomeMessage: string | null;
};

function fontStack(fontKey: string): string {
  return (FONTS[fontKey] ?? FONTS[DEFAULT_BRAND_FONT]).stack;
}

function googleFontHref(fontKey: string): string | null {
  const g = FONTS[fontKey]?.google;
  if (!g) return null;
  return `https://fonts.googleapis.com/css2?family=${g}&display=swap`;
}

// Resolve the branding to actually render. Custom values only apply when the
// user's plan allows custom branding; otherwise the defaults are used.
export async function resolveBranding(
  user: Pick<
    User,
    "brandColor" | "brandFont" | "logoUrl" | "welcomeMessage" | "plan"
  >,
  overrides?: { color?: string | null; fontKey?: string | null },
): Promise<Branding> {
  const allowed = (await getPlanConfig(user.plan)).customBranding;

  let color = allowed ? user.brandColor : DEFAULT_BRAND_COLOR;
  let fontKey = allowed ? user.brandFont : DEFAULT_BRAND_FONT;

  // Per-embed overrides (also gated on the plan) let a snippet match any site.
  if (allowed && overrides?.color && /^#[0-9a-fA-F]{6}$/.test(overrides.color)) {
    color = overrides.color;
  }
  if (allowed && overrides?.fontKey && FONTS[overrides.fontKey]) {
    fontKey = overrides.fontKey;
  }

  return {
    color,
    fontKey,
    fontStack: fontStack(fontKey),
    googleFontHref: googleFontHref(fontKey),
    logoUrl: allowed ? user.logoUrl : null,
    welcomeMessage: allowed ? user.welcomeMessage : null,
  };
}
