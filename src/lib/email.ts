import nodemailer from "nodemailer";
import { getPlatformSettings } from "@/lib/settings";
import logger from "@/lib/logger";

type Attachment = {
  filename: string;
  content: string;
  contentType?: string;
};

type Mail = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: Attachment[];
  replyTo?: string;
};

async function createTransport() {
  // DB settings take priority over env vars.
  let settings: Awaited<ReturnType<typeof getPlatformSettings>> | null = null;
  try {
    settings = await getPlatformSettings();
  } catch {
    // DB unavailable during build-time prerender — fall through to env vars.
  }

  const provider = settings?.emailProvider ?? "NONE";

  if (provider === "GMAIL_SMTP" && settings?.gmailSmtpUser && settings?.gmailSmtpPass) {
    return {
      transport: nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 587,
        secure: false,
        auth: { user: settings.gmailSmtpUser, pass: settings.gmailSmtpPass },
      }),
      from: settings.gmailSmtpFrom || `Booking <${settings.gmailSmtpUser}>`,
    };
  }

  if (
    provider === "AMAZON_SES" &&
    settings?.sesSmtpUser &&
    settings?.sesSmtpPass &&
    settings?.sesRegion
  ) {
    return {
      transport: nodemailer.createTransport({
        host: `email-smtp.${settings.sesRegion}.amazonaws.com`,
        port: 587,
        secure: false,
        auth: { user: settings.sesSmtpUser, pass: settings.sesSmtpPass },
      }),
      from: settings.sesFromAddress || "Booking <no-reply@example.com>",
    };
  }

  // Fall back to env vars (existing behavior).
  const host = process.env.SMTP_HOST;
  if (!host) return null;

  return {
    transport: nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    }),
    from: process.env.SMTP_FROM || "Booking <no-reply@example.com>",
  };
}

export async function sendEmail({ to, subject, text, html, attachments, replyTo }: Mail): Promise<void> {
  const config = await createTransport();

  if (!config) {
    const att = attachments?.length
      ? `\n  attachments: ${attachments.map((a) => a.filename).join(", ")}`
      : "";
    logger.info({ to, subject, attachments: attachments?.map((a) => a.filename) }, "No email provider configured — email not sent");
    return;
  }

  await config.transport.sendMail({
    from: config.from,
    to,
    subject,
    text,
    html,
    ...(replyTo ? { replyTo } : {}),
    attachments: attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType,
    })),
  });
}
