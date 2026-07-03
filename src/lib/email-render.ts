// Pure, dependency-free email-rendering helpers shared by the server
// (src/lib/email-templates.ts) and the client editor preview. No "server-only"
// here so the admin editor can render a live preview without a round-trip.

// Replace {{var}} tokens; unknown/absent vars render as empty string.
export function interpolate(tpl: string, ctx: Record<string, string>): string {
  return tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k: string) =>
    Object.prototype.hasOwnProperty.call(ctx, k) ? ctx[k] : "",
  );
}

// Shared branded shell wrapping every HTML email body.
export function wrapHtml(body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
        <tr><td style="padding:20px 28px;border-bottom:1px solid #f1f5f9;font-size:18px;font-weight:700;color:#0f172a;">Booking<span style="color:#4f46e5;">.</span></td></tr>
        <tr><td style="padding:28px;color:#334155;font-size:14px;line-height:1.6;">${body}</td></tr>
        <tr><td style="padding:18px 28px;border-top:1px solid #f1f5f9;color:#94a3b8;font-size:12px;line-height:1.5;">You&rsquo;re receiving this because you have a booking or an account with us.</td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

// A reusable indigo CTA button for HTML bodies.
export function button(url: string, label: string): string {
  return `<a href="${url}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:600;font-size:14px;">${label}</a>`;
}

// A pre-line paragraph so multi-line fragment variables keep their newlines.
export function pre(s: string): string {
  return `<p style="white-space:pre-line;margin:0 0 16px;">${s}</p>`;
}
