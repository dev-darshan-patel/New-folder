import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { isFeatureEnabled } from "@/lib/feature-flags";

const HOUR = 60 * 60 * 1000;

function formatWhen(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    dateStyle: "full",
    timeStyle: "short",
  }).format(date);
}

async function remind(
  kind: "24h" | "1h",
  windowStart: Date,
  windowEnd: Date,
): Promise<number> {
  const field = kind === "24h" ? "remind24hSentAt" : "remind1hSentAt";

  const due = await prisma.booking.findMany({
    where: {
      status: "CONFIRMED",
      [field]: null,
      startTime: { gt: windowStart, lte: windowEnd },
    },
    include: { eventType: true, user: true },
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  let sent = 0;

  for (const b of due) {
    const when = formatWhen(b.startTime, b.user.timezone);
    const label = kind === "24h" ? "coming up" : "in about an hour";
    try {
      await sendEmail({
        to: b.inviteeEmail,
        subject: `Reminder: ${b.eventType.title} ${label}`,
        text: `Hi ${b.inviteeName},\n\nThis is a reminder that your ${b.eventType.title} with ${b.user.businessName} is ${label}.\n\nWhen: ${when} (${b.user.timezone})\n\nNeed to change it? ${
          b.manageToken ? `${baseUrl}/booking/${b.manageToken}` : ""
        }`,
      });
      await prisma.booking.update({
        where: { id: b.id },
        data: { [field]: new Date() },
      });
      sent += 1;
    } catch (err) {
      console.error(`Failed to send ${kind} reminder for booking ${b.id}`, err);
    }
  }

  return sent;
}

// Send any due 24h and 1h reminders. Idempotent: each window is marked once
// sent, so repeated calls won't re-send. Windows are non-overlapping.
export async function sendDueReminders(): Promise<{ sent24h: number; sent1h: number }> {
  if (!(await isFeatureEnabled("email_reminders"))) {
    return { sent24h: 0, sent1h: 0 };
  }

  const now = new Date();
  const in1h = new Date(now.getTime() + HOUR);
  const in24h = new Date(now.getTime() + 24 * HOUR);

  // 1h reminders: starting within the next hour.
  const sent1h = await remind("1h", now, in1h);
  // 24h reminders: starting between 1h and 24h out (so a booking doesn't get
  // both at once).
  const sent24h = await remind("24h", in1h, in24h);

  return { sent24h, sent1h };
}
