"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import {
  getSlotsForDate,
  isBlockedByDateOverride,
  type Slot,
} from "@/lib/availability";
import { getGoogleBusyWindows, createMeetEvent } from "@/lib/google-calendar";
import { createZoomMeeting } from "@/lib/zoom";
import { sendEmail } from "@/lib/email";
import { renderTemplate } from "@/lib/email-templates";
import { buildIcs } from "@/lib/ics";
import { formatWhen } from "@/lib/format";
import { BLOCKING_STATUSES } from "@/lib/booking-status";
import logger from "@/lib/logger";

// Slots for the "New booking" picker in the dashboard. Unlike the public
// booking page, this deliberately skips the event type's min-notice
// (bufferMinutes) and per-day/week/month caps — the owner is entering a
// booking they already agreed to (e.g. over the phone), not self-serving
// against their own policy limits. Real conflicts (existing bookings,
// connected-calendar busy time, closed dates) are still enforced.
export async function fetchManualSlotsAction(eventTypeId: string, date: string): Promise<Slot[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const eventType = await prisma.eventType.findFirst({
    where: { id: eventTypeId, userId: user.id, assignmentMode: "SOLO" },
  });
  if (!eventType) return [];

  return getSlotsForDate({
    userId: user.id,
    timeZone: user.timezone,
    durationMinutes: eventType.durationMinutes,
    bufferMinutes: 0,
    date,
  });
}

export type ManualBookingResult = { ok: true } | { ok: false; error: string };

// Owner-created booking for a phone/walk-in customer. Confirmed immediately
// (no approval step — the owner is the approver) and, unlike the public
// path, notifying the invitee by email is optional.
export async function createManualBookingAction(input: {
  eventTypeId: string;
  startUtc: string;
  name: string;
  email: string;
  notes?: string;
  notifyInvitee: boolean;
}): Promise<ManualBookingResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  const eventType = await prisma.eventType.findFirst({
    where: { id: input.eventTypeId, userId: user.id },
  });
  if (!eventType) return { ok: false, error: "Event type not found." };
  if (eventType.assignmentMode !== "SOLO") {
    return { ok: false, error: "Manual booking is only supported for solo event types right now." };
  }

  const name = input.name.trim().slice(0, 200);
  const email = input.email.trim().toLowerCase().slice(0, 320);
  if (!name || !email) return { ok: false, error: "Name and email are required." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, error: "Please enter a valid email address." };
  }

  const start = new Date(input.startUtc);
  if (Number.isNaN(start.getTime()) || start.getTime() < Date.now()) {
    return { ok: false, error: "That time is no longer available." };
  }
  const end = new Date(start.getTime() + eventType.durationMinutes * 60_000);

  if (await isBlockedByDateOverride(user.id, start, end, user.timezone)) {
    return { ok: false, error: "This date is marked closed. Remove the date override first to book anyway." };
  }
  const googleBusy = await getGoogleBusyWindows(user.id, start, end);
  if (googleBusy.some((b) => start < b.end && end > b.start)) {
    return { ok: false, error: "You're marked busy on your connected Google Calendar at that time." };
  }

  const manageToken = `booked-${crypto.randomUUID()}`;
  let bookingId: string;
  try {
    bookingId = await prisma.$transaction(async (tx) => {
      const conflict = await tx.booking.findFirst({
        where: {
          userId: user.id,
          status: { in: BLOCKING_STATUSES },
          startTime: { lt: end },
          endTime: { gt: start },
        },
      });
      if (conflict) throw new Error("SLOT_TAKEN");

      const created = await tx.booking.create({
        data: {
          userId: user.id,
          eventTypeId: eventType.id,
          inviteeName: name,
          inviteeEmail: email,
          notes: input.notes?.trim().slice(0, 2000) || null,
          startTime: start,
          endTime: end,
          manageToken,
          status: "CONFIRMED",
        },
      });
      return created.id;
    });
  } catch (err) {
    if (err instanceof Error && err.message === "SLOT_TAKEN") {
      return { ok: false, error: "That time overlaps an existing booking." };
    }
    throw err;
  }

  revalidatePath("/dashboard/bookings");

  // Best-effort meeting link, same as the public booking flow. Never blocks
  // the booking itself if the provider call fails.
  let meetingUrl: string | null = null;
  let locationText: string | null = null;
  if (eventType.locationType === "GOOGLE_MEET") {
    const meet = await createMeetEvent({
      userId: user.id,
      summary: `${eventType.title} — ${name}`,
      startUtc: start,
      endUtc: end,
      timeZone: user.timezone,
      attendees: [
        { email, name },
        { email: user.email, name: user.businessName },
      ],
    });
    if (meet) {
      meetingUrl = meet.meetingUrl;
      locationText = meet.meetingUrl;
      await prisma.booking.update({
        where: { id: bookingId },
        data: { meetingUrl: meet.meetingUrl, calendarEventId: meet.calendarEventId, meetingProvider: "google" },
      });
    }
  } else if (eventType.locationType === "ZOOM") {
    const meet = await createZoomMeeting({
      userId: user.id,
      topic: `${eventType.title} — ${name}`,
      startUtc: start,
      endUtc: end,
      timeZone: user.timezone,
    });
    if (meet) {
      meetingUrl = meet.meetingUrl;
      locationText = meet.meetingUrl;
      await prisma.booking.update({
        where: { id: bookingId },
        data: { meetingUrl: meet.meetingUrl, calendarEventId: meet.meetingId, meetingProvider: "zoom" },
      });
    }
  } else if (eventType.locationDetail) {
    locationText = eventType.locationDetail;
  }

  if (!input.notifyInvitee) return { ok: true };

  const when = formatWhen(start, user.timezone);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const manageUrl = `${baseUrl}/booking/${manageToken}`;
  const meetLine = meetingUrl ? `\nJoin: ${meetingUrl}` : locationText ? `\nWhere: ${locationText}` : "";

  const ics = buildIcs({
    uid: manageToken,
    sequence: 0,
    method: "REQUEST",
    start,
    end,
    title: `${eventType.title} — ${user.businessName}`,
    description: `Booking with ${user.businessName}.${meetingUrl ? ` Join: ${meetingUrl}.` : ""} Manage: ${manageUrl}`,
    organizerName: user.businessName,
    organizerEmail: user.email,
    attendeeName: name,
    attendeeEmail: email,
    location: locationText,
  });

  try {
    const inviteeEmail = await renderTemplate("booking.confirmed.invitee", {
      invitee_name: name,
      business_name: user.businessName,
      event_title: eventType.title,
      when,
      timezone: user.timezone,
      with_line: meetLine,
      manage_url: manageUrl,
    });
    await sendEmail({
      to: email,
      ...inviteeEmail,
      attachments: [{ filename: "invite.ics", content: ics, contentType: "text/calendar; charset=utf-8; method=REQUEST" }],
      ...(eventType.replyToEmail ? { replyTo: eventType.replyToEmail } : {}),
    });
  } catch (err) {
    logger.error({ err, bookingId }, "Failed to send manual-booking confirmation email");
  }

  return { ok: true };
}
