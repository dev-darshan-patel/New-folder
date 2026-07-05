import "server-only";
import { prisma } from "@/lib/prisma";
import { interpolate, wrapHtml, button, pre, type EmailBrand } from "@/lib/email-render";

export { interpolate, wrapHtml } from "@/lib/email-render";
export type { EmailBrand } from "@/lib/email-render";

// -----------------------------------------------------------------------------
// Admin-editable transactional email templates.
//
// Each send-site in the app renders through `renderTemplate(key, ctx)`, which
// pulls the DB row for `key`, substitutes {{variables}} from `ctx`, and wraps
// the HTML body in the shared branded shell. If the row is missing or disabled,
// it falls back to the hardcoded default below — so editing a template in the
// admin console can never break delivery.
//
// Variables are dumb string substitution: {{name}} -> ctx["name"]. Missing keys
// render as empty. Multi-line "fragment" variables (e.g. an optional "With: …"
// line) are reused across the text and HTML bodies; the HTML shell renders them
// inside white-space:pre-line blocks so newlines survive.
// -----------------------------------------------------------------------------

export type TemplateCategory = "AUTH" | "ACCOUNT" | "BOOKING" | "NOTIFICATION";

export type TemplateVar = {
  name: string;
  description: string;
  sample: string;
};

export type TemplateDef = {
  key: string;
  category: TemplateCategory;
  name: string;
  description: string;
  subject: string;
  // HTML body fragment (without the shared shell — the shell is applied at render).
  html: string;
  text: string;
  vars: TemplateVar[];
};

// -----------------------------------------------------------------------------
// Template registry
// -----------------------------------------------------------------------------

export const TEMPLATE_DEFS: TemplateDef[] = [
  // --- BOOKING -------------------------------------------------------------
  {
    key: "booking.confirmed.invitee",
    category: "BOOKING",
    name: "Booking confirmed (to invitee)",
    description: "Sent to the customer when they successfully book a slot.",
    subject: "Booking confirmed: {{event_title}}",
    text: `Hi {{invitee_name}},\n\nYour booking with {{business_name}} is confirmed.\n\nWhat: {{event_title}}\nWhen: {{when}} ({{timezone}}){{with_line}}\n\nThe calendar invite is attached. Need to change it? Reschedule or cancel here:\n{{manage_url}}\n\nSee you then!`,
    html: `<p style="margin:0 0 16px;">Hi {{invitee_name}},</p>
<p style="margin:0 0 16px;">Your booking with <strong>{{business_name}}</strong> is confirmed.</p>
${pre(`What: {{event_title}}\nWhen: {{when}} ({{timezone}}){{with_line}}`)}
<p style="margin:0 0 20px;">The calendar invite is attached.</p>
<p style="margin:0 0 20px;">${button("{{manage_url}}", "Reschedule or cancel")}</p>
<p style="margin:0;color:#64748b;">See you then!</p>`,
    vars: [
      { name: "invitee_name", description: "Customer's name", sample: "Alex Carter" },
      { name: "business_name", description: "Business name", sample: "Demo Salon" },
      { name: "event_title", description: "Event type title", sample: "30 Minute Meeting" },
      { name: "when", description: "Formatted date & time", sample: "Friday, July 10, 2026 at 2:30 PM" },
      { name: "timezone", description: "Invitee timezone", sample: "Asia/Calcutta" },
      { name: "with_line", description: "Optional '\\nWith: …' line (team assignee)", sample: "\nWith: Jamie Lee" },
      { name: "manage_url", description: "Reschedule/cancel link", sample: "https://example.com/booking/abc123" },
    ],
  },
  {
    key: "booking.created.owner",
    category: "BOOKING",
    name: "New booking (to owner)",
    description: "Sent to the business owner when a customer books.",
    subject: "New booking: {{event_title}} with {{invitee_name}}",
    text: `{{invitee_name}} ({{invitee_email}}) booked {{event_title}}.\nWhen: {{when}} ({{timezone}}){{extra}}`,
    html: `<p style="margin:0 0 16px;"><strong>{{invitee_name}}</strong> ({{invitee_email}}) booked {{event_title}}.</p>
${pre(`When: {{when}} ({{timezone}}){{extra}}`)}`,
    vars: [
      { name: "invitee_name", description: "Customer's name", sample: "Alex Carter" },
      { name: "invitee_email", description: "Customer's email", sample: "alex@example.com" },
      { name: "event_title", description: "Event type title", sample: "30 Minute Meeting" },
      { name: "when", description: "Formatted date & time (business tz)", sample: "Friday, July 10, 2026 at 2:30 PM" },
      { name: "timezone", description: "Business timezone", sample: "America/New_York" },
      { name: "extra", description: "Optional notes + intake answers block", sample: "\nNotes: First visit\nPhone: 555-0100" },
    ],
  },
  {
    key: "booking.pending.invitee",
    category: "BOOKING",
    name: "Booking request received (to invitee)",
    description: "Sent to the customer when their booking requires the owner's approval.",
    subject: "Booking request received: {{event_title}}",
    text: `Hi {{invitee_name}},\n\nThanks for requesting a booking with {{business_name}}. It's not confirmed yet — {{business_name}} needs to approve it first.\n\nWhat: {{event_title}}\nWhen: {{when}} ({{timezone}})\n\nWe'll email you as soon as it's approved.`,
    html: `<p style="margin:0 0 16px;">Hi {{invitee_name}},</p>
<p style="margin:0 0 16px;">Thanks for requesting a booking with <strong>{{business_name}}</strong>. It&rsquo;s not confirmed yet &mdash; {{business_name}} needs to approve it first.</p>
${pre(`What: {{event_title}}\nWhen: {{when}} ({{timezone}})`)}
<p style="margin:0;color:#64748b;">We&rsquo;ll email you as soon as it&rsquo;s approved.</p>`,
    vars: [
      { name: "invitee_name", description: "Customer's name", sample: "Alex Carter" },
      { name: "business_name", description: "Business name", sample: "Demo Salon" },
      { name: "event_title", description: "Event type title", sample: "30 Minute Meeting" },
      { name: "when", description: "Formatted date & time", sample: "Friday, July 10, 2026 at 2:30 PM" },
      { name: "timezone", description: "Invitee timezone", sample: "Asia/Calcutta" },
    ],
  },
  {
    key: "booking.pending.owner",
    category: "BOOKING",
    name: "New booking request (to owner)",
    description: "Sent to the business owner when a customer requests a booking that needs approval.",
    subject: "Approval needed: {{event_title}} with {{invitee_name}}",
    text: `{{invitee_name}} ({{invitee_email}}) requested {{event_title}}.\nWhen: {{when}} ({{timezone}})\n\nReview and approve or decline it here:\n{{review_url}}`,
    html: `<p style="margin:0 0 16px;"><strong>{{invitee_name}}</strong> ({{invitee_email}}) requested {{event_title}}.</p>
${pre(`When: {{when}} ({{timezone}})`)}
<p style="margin:0;">${button("{{review_url}}", "Review request")}</p>`,
    vars: [
      { name: "invitee_name", description: "Customer's name", sample: "Alex Carter" },
      { name: "invitee_email", description: "Customer's email", sample: "alex@example.com" },
      { name: "event_title", description: "Event type title", sample: "30 Minute Meeting" },
      { name: "when", description: "Formatted date & time (business tz)", sample: "Friday, July 10, 2026 at 2:30 PM" },
      { name: "timezone", description: "Business timezone", sample: "America/New_York" },
      { name: "review_url", description: "Link to the dashboard bookings page", sample: "https://example.com/dashboard/bookings" },
    ],
  },
  {
    key: "booking.declined.invitee",
    category: "BOOKING",
    name: "Booking request declined (to invitee)",
    description: "Sent to the customer when the owner declines their booking request.",
    subject: "Booking request declined: {{event_title}}",
    text: `Hi {{invitee_name}},\n\n{{business_name}} wasn't able to accept your request for {{event_title}} on {{when}}. Please pick another time.`,
    html: `<p style="margin:0 0 16px;">Hi {{invitee_name}},</p>
<p style="margin:0;"><strong>{{business_name}}</strong> wasn&rsquo;t able to accept your request for {{event_title}} on {{when}}. Please pick another time.</p>`,
    vars: [
      { name: "invitee_name", description: "Customer's name", sample: "Alex Carter" },
      { name: "business_name", description: "Business name", sample: "Demo Salon" },
      { name: "event_title", description: "Event type title", sample: "30 Minute Meeting" },
      { name: "when", description: "Formatted date & time", sample: "Friday, July 10, 2026 at 2:30 PM" },
    ],
  },
  {
    key: "booking.reminder",
    category: "BOOKING",
    name: "Booking reminder",
    description: "Sent 24h and 1h before a confirmed booking.",
    subject: "Reminder: {{event_title}} {{label}}",
    text: `Hi {{invitee_name}},\n\nThis is a reminder that your {{event_title}} with {{business_name}} is {{label}}.\n\nWhen: {{when}} ({{timezone}})\n\nNeed to change it? {{manage_url}}`,
    html: `<p style="margin:0 0 16px;">Hi {{invitee_name}},</p>
<p style="margin:0 0 16px;">This is a reminder that your <strong>{{event_title}}</strong> with {{business_name}} is {{label}}.</p>
${pre(`When: {{when}} ({{timezone}})`)}
<p style="margin:0;">${button("{{manage_url}}", "Reschedule or cancel")}</p>`,
    vars: [
      { name: "invitee_name", description: "Customer's name", sample: "Alex Carter" },
      { name: "business_name", description: "Business name", sample: "Demo Salon" },
      { name: "event_title", description: "Event type title", sample: "30 Minute Meeting" },
      { name: "label", description: "'coming up' or 'in about an hour'", sample: "coming up" },
      { name: "when", description: "Formatted date & time", sample: "Friday, July 10, 2026 at 2:30 PM" },
      { name: "timezone", description: "Business timezone", sample: "America/New_York" },
      { name: "manage_url", description: "Reschedule/cancel link", sample: "https://example.com/booking/abc123" },
    ],
  },
  {
    key: "booking.canceled.invitee",
    category: "BOOKING",
    name: "Booking canceled (to invitee)",
    description: "Sent to the customer when their booking is canceled.",
    subject: "Booking canceled: {{event_title}}",
    text: `Hi {{invitee_name}},\n\nYour booking with {{business_name}} on {{when}} has been canceled.`,
    html: `<p style="margin:0 0 16px;">Hi {{invitee_name}},</p>
<p style="margin:0;">Your booking with <strong>{{business_name}}</strong> on {{when}} has been canceled.</p>`,
    vars: [
      { name: "invitee_name", description: "Customer's name", sample: "Alex Carter" },
      { name: "business_name", description: "Business name", sample: "Demo Salon" },
      { name: "event_title", description: "Event type title", sample: "30 Minute Meeting" },
      { name: "when", description: "Formatted date & time", sample: "Friday, July 10, 2026 at 2:30 PM" },
    ],
  },
  {
    key: "booking.canceled.owner",
    category: "BOOKING",
    name: "Booking canceled (to owner)",
    description: "Sent to the business owner when a customer cancels.",
    subject: "Booking canceled: {{event_title}}",
    text: `{{invitee_name}} canceled their {{event_title}} on {{when}}.`,
    html: `<p style="margin:0;"><strong>{{invitee_name}}</strong> canceled their {{event_title}} on {{when}}.</p>`,
    vars: [
      { name: "invitee_name", description: "Customer's name", sample: "Alex Carter" },
      { name: "event_title", description: "Event type title", sample: "30 Minute Meeting" },
      { name: "when", description: "Formatted date & time", sample: "Friday, July 10, 2026 at 2:30 PM" },
    ],
  },
  {
    key: "booking.rescheduled.invitee",
    category: "BOOKING",
    name: "Booking rescheduled (to invitee)",
    description: "Sent to the customer when their booking is moved.",
    subject: "Booking rescheduled: {{event_title}}",
    text: `Hi {{invitee_name}},\n\nYour booking with {{business_name}} has been moved to {{when}} ({{timezone}}){{with_line}}. The updated calendar invite is attached.`,
    html: `<p style="margin:0 0 16px;">Hi {{invitee_name}},</p>
${pre(`Your booking with {{business_name}} has been moved to {{when}} ({{timezone}}){{with_line}}.`)}
<p style="margin:0;">The updated calendar invite is attached.</p>`,
    vars: [
      { name: "invitee_name", description: "Customer's name", sample: "Alex Carter" },
      { name: "business_name", description: "Business name", sample: "Demo Salon" },
      { name: "event_title", description: "Event type title", sample: "30 Minute Meeting" },
      { name: "when", description: "New formatted date & time", sample: "Monday, July 13, 2026 at 4:00 PM" },
      { name: "timezone", description: "Business timezone", sample: "America/New_York" },
      { name: "with_line", description: "Optional '\\nWith: …' line", sample: "\nWith: Jamie Lee" },
    ],
  },
  {
    key: "booking.rescheduled.owner",
    category: "BOOKING",
    name: "Booking rescheduled (to owner)",
    description: "Sent to the business owner when a customer reschedules.",
    subject: "Booking rescheduled: {{event_title}}",
    text: `{{invitee_name}} rescheduled {{event_title}} to {{when}}.`,
    html: `<p style="margin:0;"><strong>{{invitee_name}}</strong> rescheduled {{event_title}} to {{when}}.</p>`,
    vars: [
      { name: "invitee_name", description: "Customer's name", sample: "Alex Carter" },
      { name: "event_title", description: "Event type title", sample: "30 Minute Meeting" },
      { name: "when", description: "New formatted date & time", sample: "Monday, July 13, 2026 at 4:00 PM" },
    ],
  },

  // --- AUTH ----------------------------------------------------------------
  {
    key: "auth.verify_email",
    category: "AUTH",
    name: "Email verification",
    description: "Sent on signup (and resend) to confirm the email address.",
    subject: "Verify your email address",
    text: `Hi {{user_name}},\n\nWelcome! Please confirm your email address by clicking the link below (valid for 24 hours):\n\n{{verify_url}}\n\nIf you didn't create this account, you can ignore this email.`,
    html: `<p style="margin:0 0 16px;">Hi {{user_name}},</p>
<p style="margin:0 0 20px;">Welcome! Please confirm your email address (valid for 24 hours):</p>
<p style="margin:0 0 20px;">${button("{{verify_url}}", "Verify email")}</p>
<p style="margin:0;color:#64748b;">If you didn&rsquo;t create this account, you can ignore this email.</p>`,
    vars: [
      { name: "user_name", description: "Account owner's name", sample: "Darshan Patel" },
      { name: "verify_url", description: "Verification link", sample: "https://example.com/verify-email/tok123" },
    ],
  },
  {
    key: "auth.password_reset",
    category: "AUTH",
    name: "Password reset",
    description: "Sent when a password reset is requested (self-serve or admin).",
    subject: "Reset your password",
    text: `Hi {{user_name}},\n\nSomeone requested a password reset for your account. Click the link below to set a new password. It expires in 1 hour.\n\n{{reset_url}}\n\nIf you didn't request this, you can safely ignore this email.`,
    html: `<p style="margin:0 0 16px;">Hi {{user_name}},</p>
<p style="margin:0 0 20px;">Someone requested a password reset for your account. It expires in 1 hour.</p>
<p style="margin:0 0 20px;">${button("{{reset_url}}", "Set a new password")}</p>
<p style="margin:0;color:#64748b;">If you didn&rsquo;t request this, you can safely ignore this email.</p>`,
    vars: [
      { name: "user_name", description: "Account owner's name", sample: "Darshan Patel" },
      { name: "reset_url", description: "Password reset link", sample: "https://example.com/reset-password/tok123" },
    ],
  },
  {
    key: "auth.password_changed",
    category: "AUTH",
    name: "Password changed",
    description: "Sent as a confirmation after the account password is changed.",
    subject: "Your password was changed",
    text: `Hi {{user_name}},\n\nThis is a confirmation that your account password was just changed.\n\nIf this wasn't you, reset your password immediately or contact support.`,
    html: `<p style="margin:0 0 16px;">Hi {{user_name}},</p>
<p style="margin:0 0 16px;">This is a confirmation that your account password was just changed.</p>
<p style="margin:0;color:#64748b;">If this wasn&rsquo;t you, reset your password immediately or contact support.</p>`,
    vars: [
      { name: "user_name", description: "Account owner's name", sample: "Darshan Patel" },
    ],
  },

  {
    key: "auth.account_locked",
    category: "AUTH",
    name: "Account locked",
    description: "Sent when an account is temporarily locked after too many failed login attempts.",
    subject: "Your account has been temporarily locked",
    text: `Hi {{user_name}},\n\nWe noticed multiple failed login attempts on your account. For your security, it has been temporarily locked for 15 minutes.\n\nIf this was you, simply wait and try again. If not, reset your password immediately.`,
    html: `<p style="margin:0 0 16px;">Hi {{user_name}},</p>
<p style="margin:0 0 16px;">We noticed multiple failed login attempts on your account. For your security, it has been temporarily locked for 15 minutes.</p>
<p style="margin:0;color:#64748b;">If this was you, simply wait and try again. If not, reset your password immediately.</p>`,
    vars: [
      { name: "user_name", description: "Account owner's name", sample: "Darshan Patel" },
    ],
  },

  // --- ACCOUNT -------------------------------------------------------------
  {
    key: "account.welcome",
    category: "ACCOUNT",
    name: "Welcome email",
    description: "Sent after a new user verifies their email address.",
    subject: "Welcome to Booking",
    text: `Hi {{user_name}},\n\nYour email is verified and your account is ready. Head to your dashboard to set your availability and share your booking link.\n\n{{login_url}}\n\nHappy scheduling!`,
    html: `<p style="margin:0 0 16px;">Hi {{user_name}},</p>
<p style="margin:0 0 20px;">Your email is verified and your account is ready. Set your availability and share your booking link to start taking appointments.</p>
<p style="margin:0 0 20px;">${button("{{login_url}}", "Go to dashboard")}</p>
<p style="margin:0;color:#64748b;">Happy scheduling!</p>`,
    vars: [
      { name: "user_name", description: "Account owner's name", sample: "Darshan Patel" },
      { name: "login_url", description: "Dashboard link", sample: "https://example.com/dashboard" },
    ],
  },
  {
    key: "account.suspended",
    category: "ACCOUNT",
    name: "Account suspended",
    description: "Sent when an admin suspends an account.",
    subject: "Your account has been suspended",
    text: `Hi {{user_name}},\n\nYour account has been suspended and your public booking page is temporarily unavailable.\n\nIf you believe this is a mistake, please contact support.`,
    html: `<p style="margin:0 0 16px;">Hi {{user_name}},</p>
<p style="margin:0 0 16px;">Your account has been suspended and your public booking page is temporarily unavailable.</p>
<p style="margin:0;color:#64748b;">If you believe this is a mistake, please contact support.</p>`,
    vars: [
      { name: "user_name", description: "Account owner's name", sample: "Darshan Patel" },
    ],
  },
  {
    key: "account.restored",
    category: "ACCOUNT",
    name: "Account reactivated",
    description: "Sent when an admin lifts a suspension.",
    subject: "Your account has been reactivated",
    text: `Hi {{user_name}},\n\nGood news — your account has been reactivated and your booking page is live again.\n\n{{login_url}}`,
    html: `<p style="margin:0 0 16px;">Hi {{user_name}},</p>
<p style="margin:0 0 20px;">Good news &mdash; your account has been reactivated and your booking page is live again.</p>
<p style="margin:0;">${button("{{login_url}}", "Go to dashboard")}</p>`,
    vars: [
      { name: "user_name", description: "Account owner's name", sample: "Darshan Patel" },
      { name: "login_url", description: "Dashboard link", sample: "https://example.com/dashboard" },
    ],
  },
];

export const CATEGORY_LABELS: Record<TemplateCategory, string> = {
  AUTH: "Authentication",
  ACCOUNT: "Account",
  BOOKING: "Bookings",
  NOTIFICATION: "Notifications",
};

export function getTemplateDef(key: string): TemplateDef | undefined {
  return TEMPLATE_DEFS.find((d) => d.key === key);
}

export type RenderedEmail = { subject: string; html: string; text: string };

// Render a template by key. Uses the DB row if present AND enabled; otherwise
// falls back to the hardcoded default so delivery never depends on a row.
export async function renderTemplate(
  key: string,
  ctx: Record<string, string>,
): Promise<RenderedEmail> {
  const def = getTemplateDef(key);

  let row: { subject: string; html: string; text: string; enabled: boolean } | null = null;
  try {
    row = await prisma.emailTemplate.findUnique({
      where: { key },
      select: { subject: true, html: true, text: true, enabled: true },
    });
  } catch {
    // DB unavailable (e.g. build-time prerender) — fall back to defaults.
  }

  const useRow = row?.enabled ? row : null;
  const subjectTpl = useRow?.subject ?? def?.subject ?? "";
  const htmlTpl = useRow?.html ?? def?.html ?? "";
  const textTpl = useRow?.text ?? def?.text ?? "";

  const brand = await getEmailBrand();

  return {
    subject: interpolate(subjectTpl, ctx),
    html: wrapHtml(interpolate(htmlTpl, ctx), brand),
    text: interpolate(textTpl, ctx),
  };
}

// Resolve the active email branding from platform settings. Returns undefined
// fields where unset so wrapHtml applies its built-in defaults.
export async function getEmailBrand(): Promise<EmailBrand> {
  try {
    const s = await prisma.platformSettings.findUnique({
      where: { id: "singleton" },
      select: {
        emailBrandName: true,
        emailLogoUrl: true,
        emailAccentColor: true,
        emailFooterText: true,
        emailSupportUrl: true,
      },
    });
    return {
      name: s?.emailBrandName,
      logoUrl: s?.emailLogoUrl,
      accentColor: s?.emailAccentColor,
      footerText: s?.emailFooterText,
      supportUrl: s?.emailSupportUrl,
    };
  } catch {
    return {};
  }
}

// Seed any missing template rows (create-only; never clobbers admin edits).
// Uses a single createMany with skipDuplicates so concurrent renders can't race
// into a unique-constraint error the way parallel upserts would.
export async function ensureEmailTemplates(): Promise<void> {
  await prisma.emailTemplate.createMany({
    data: TEMPLATE_DEFS.map((def) => ({
      key: def.key,
      category: def.category,
      name: def.name,
      subject: def.subject,
      html: def.html,
      text: def.text,
      enabled: true,
    })),
    skipDuplicates: true,
  });
}
