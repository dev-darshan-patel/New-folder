// Pure, dependency-free email-rendering helpers shared by the server
// (src/lib/email-templates.ts) and the client editor preview. No "server-only"
// here so the admin editor can render a live preview without a round-trip.

// Configurable branding for the shared email shell. All fields optional; each
// falls back to a built-in default so the shell always renders.
export type EmailBrand = {
  name?: string | null;
  logoUrl?: string | null;
  accentColor?: string | null;
  footerText?: string | null;
  supportUrl?: string | null;
};

export const DEFAULT_BRAND = {
  name: "Booking",
  logoUrl: "",
  accentColor: "#4f46e5",
  footerText: "You're receiving this because you have a booking or an account with us.",
  supportUrl: "",
} as const;

function resolveBrand(brand?: EmailBrand) {
  return {
    name: brand?.name || DEFAULT_BRAND.name,
    logoUrl: brand?.logoUrl || DEFAULT_BRAND.logoUrl,
    accentColor: brand?.accentColor || DEFAULT_BRAND.accentColor,
    footerText: brand?.footerText || DEFAULT_BRAND.footerText,
    supportUrl: brand?.supportUrl || DEFAULT_BRAND.supportUrl,
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Replace {{var}} tokens; unknown/absent vars render as empty string.
export function interpolate(tpl: string, ctx: Record<string, string>): string {
  return tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k: string) =>
    Object.prototype.hasOwnProperty.call(ctx, k) ? ctx[k] : "",
  );
}

// Shared branded shell wrapping every HTML email body.
export function wrapHtml(body: string, brand?: EmailBrand): string {
  const b = resolveBrand(brand);
  const safeName = escapeHtml(b.name);

  const header = b.logoUrl
    ? `<img src="${escapeHtml(b.logoUrl)}" alt="${safeName}" style="max-height:32px;display:block;">`
    : `${safeName}<span style="color:${b.accentColor};">.</span>`;

  const footer = b.supportUrl
    ? `${escapeHtml(b.footerText)}<br><a href="${escapeHtml(b.supportUrl)}" style="color:${b.accentColor};text-decoration:none;">Contact support</a>`
    : escapeHtml(b.footerText);

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
        <tr><td style="padding:20px 28px;border-bottom:1px solid #f1f5f9;font-size:18px;font-weight:700;color:#0f172a;">${header}</td></tr>
        <tr><td style="padding:28px;color:#334155;font-size:14px;line-height:1.6;">${body}</td></tr>
        <tr><td style="padding:18px 28px;border-top:1px solid #f1f5f9;color:#94a3b8;font-size:12px;line-height:1.5;">${footer}</td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

// A reusable CTA button for HTML bodies, tinted with the brand accent.
export function button(url: string, label: string, accentColor = DEFAULT_BRAND.accentColor): string {
  return `<a href="${url}" style="display:inline-block;background:${accentColor};color:#ffffff;text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:600;font-size:14px;">${label}</a>`;
}

// A pre-line paragraph so multi-line fragment variables keep their newlines.
export function pre(s: string): string {
  return `<p style="white-space:pre-line;margin:0 0 16px;">${s}</p>`;
}
