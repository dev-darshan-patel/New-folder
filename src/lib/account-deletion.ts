import "server-only";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { BLOCKING_STATUSES } from "@/lib/booking-status";
import { sendEmail } from "@/lib/email";
import { renderTemplate } from "@/lib/email-templates";
import { buildIcs } from "@/lib/ics";
import { formatWhen } from "@/lib/format";
import { deleteMeetEvent } from "@/lib/google-calendar";
import { deleteZoomMeeting } from "@/lib/zoom";
import { getStripe } from "@/lib/stripe";

// How long an owner has to undo a deletion request before the destructive
// cascade (cron Phase 6) runs. Account stays fully active the whole time.
export const DELETION_GRACE_HOURS = 48;

// How long after the cascade runs before the account is hard-deleted
// (cron Phase 8). Recoverable via emailed token until then.
export const DELETION_PURGE_DAYS = 30;

export function graceDeadline(requestedAt: Date): Date {
  return new Date(requestedAt.getTime() + DELETION_GRACE_HOURS * 60 * 60 * 1000);
}

export function purgeDeadline(deletedAt: Date): Date {
  return new Date(deletedAt.getTime() + DELETION_PURGE_DAYS * 24 * 60 * 60 * 1000);
}

export type DeletionImpact = {
  upcomingBookingCount: number;
  hasActiveSubscription: boolean;
  plan: string;
};

// What will be lost/cancelled if this account is deleted — shown to the owner
// before they confirm, so the request isn't a black box.
export async function getDeletionImpact(userId: string): Promise<DeletionImpact> {
  const [upcomingBookingCount, user] = await Promise.all([
    prisma.booking.count({
      where: { userId, startTime: { gte: new Date() }, status: { in: BLOCKING_STATUSES } },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true, stripeSubscriptionId: true, subscriptionStatus: true },
    }),
  ]);

  return {
    upcomingBookingCount,
    hasActiveSubscription: Boolean(
      user?.stripeSubscriptionId && user.subscriptionStatus !== "canceled",
    ),
    plan: user?.plan ?? "FREE",
  };
}

// The destructive part of self-service deletion. Runs once the grace period
// (DELETION_GRACE_HOURS) has elapsed for a user with an active
// deletionRequestedAt. Cancels upcoming bookings (notifying invitees + tearing
// down video meetings), cancels the Stripe subscription, kills all sessions,
// and stamps deletedAt/purgeScheduledAt/recoveryToken so the account enters
// the 30-day recoverable-purge window. Idempotent-ish: only ever called for
// rows the caller has already filtered to `deletedAt: null`.
export async function runDeletionCascade(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt) return;

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  // Cancel any active group sessions this owner created — deletes the shared
  // meeting once per session rather than per-attendee.
  const sessions = await prisma.session.findMany({
    where: { eventType: { userId }, cancelled: false },
  });
  for (const session of sessions) {
    if (session.calendarEventId) {
      if (session.meetingProvider === "zoom") {
        await deleteZoomMeeting(userId, session.calendarEventId);
      } else if (session.meetingProvider === "google") {
        await deleteMeetEvent(userId, session.calendarEventId);
      }
    }
    await prisma.session.update({
      where: { id: session.id },
      data: { cancelled: true, seatsTaken: 0 },
    });
  }

  // Cancel every still-active booking (upcoming or not — the account is going
  // away either way) and notify each invitee. Meetings owned by a session were
  // already torn down above, so skip those here.
  const bookings = await prisma.booking.findMany({
    where: { userId, status: { in: BLOCKING_STATUSES } },
    include: { eventType: true },
  });
  if (bookings.length > 0) {
    await prisma.booking.updateMany({
      where: { id: { in: bookings.map((b) => b.id) } },
      data: { status: "CANCELLED" },
    });
  }
  for (const b of bookings) {
    if (!b.sessionId && b.calendarEventId) {
      if (b.meetingProvider === "zoom") {
        await deleteZoomMeeting(userId, b.calendarEventId);
      } else {
        await deleteMeetEvent(userId, b.calendarEventId);
      }
    }
    try {
      const when = formatWhen(b.startTime, user.timezone);
      const cancelIcs = {
        filename: "invite.ics",
        content: buildIcs({
          uid: b.manageToken ?? b.id,
          sequence: b.sequence + 1,
          method: "CANCEL" as const,
          start: b.startTime,
          end: b.endTime,
          title: `${b.eventType.title} — ${user.businessName}`,
          organizerName: user.businessName,
          organizerEmail: user.email,
          attendeeName: b.inviteeName,
          attendeeEmail: b.inviteeEmail,
        }),
        contentType: "text/calendar; charset=utf-8; method=CANCEL",
      };
      const mail = await renderTemplate("booking.canceled.invitee", {
        invitee_name: b.inviteeName,
        business_name: user.businessName,
        event_title: b.eventType.title,
        when,
      });
      await sendEmail({ to: b.inviteeEmail, ...mail, attachments: [cancelIcs] });
    } catch (err) {
      console.error("Failed to send deletion-cascade cancellation email", err);
    }
  }

  // Cancel the live Stripe subscription outright (not at period end — the
  // account is being deactivated now).
  if (user.stripeSubscriptionId) {
    try {
      const stripe = await getStripe();
      if (stripe) await stripe.subscriptions.cancel(user.stripeSubscriptionId);
    } catch (err) {
      console.error("Failed to cancel Stripe subscription during account deletion", err);
    }
  }

  const now = new Date();
  const recoveryToken = crypto.randomUUID();
  const purgeAt = purgeDeadline(now);

  await prisma.user.update({
    where: { id: userId },
    data: {
      deletedAt: now,
      purgeScheduledAt: purgeAt,
      recoveryToken,
      plan: "FREE",
      stripeSubscriptionId: null,
      subscriptionStatus: "canceled",
      cancelAtPeriodEnd: false,
      planCancelRequestedAt: null,
      tokenVersion: { increment: 1 },
    },
  });

  try {
    const mail = await renderTemplate("account.deletion_finalized", {
      user_name: user.name,
      purge_date: new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(purgeAt),
      recover_url: `${baseUrl}/recover/${recoveryToken}`,
    });
    await sendEmail({ to: user.email, ...mail });
  } catch (err) {
    console.error("Failed to send deletion-finalized email", err);
  }
}

// Find users whose grace period has elapsed and run the cascade for each.
// Returns how many accounts were processed.
export async function processDueDeletions(): Promise<number> {
  const cutoff = new Date(Date.now() - DELETION_GRACE_HOURS * 60 * 60 * 1000);
  const due = await prisma.user.findMany({
    where: { deletionRequestedAt: { lte: cutoff }, deletedAt: null },
    select: { id: true },
  });
  for (const u of due) {
    await runDeletionCascade(u.id);
  }
  return due.length;
}

// Hard-delete accounts whose purge date has passed. Cascades handle child rows
// via existing onDelete: Cascade relations.
export async function processDuePurges(): Promise<number> {
  const due = await prisma.user.findMany({
    where: { purgeScheduledAt: { lte: new Date() }, deletedAt: { not: null } },
    select: { id: true, avatarUrl: true },
  });
  for (const u of due) {
    if (u.avatarUrl) {
      try {
        const { del } = await import("@vercel/blob");
        await del(u.avatarUrl);
      } catch (err) {
        console.error("Failed to delete avatar blob during purge", err);
      }
    }
    await prisma.user.delete({ where: { id: u.id } });
  }
  return due.length;
}
