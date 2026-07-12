"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { renderTemplate } from "@/lib/email-templates";
import { buildIcs } from "@/lib/ics";
import { formatWhen } from "@/lib/format";
import { createMeetEvent } from "@/lib/google-calendar";
import { createZoomMeeting } from "@/lib/zoom";
import { parseGuests } from "@/lib/guests";
import logger from "@/lib/logger";

// Approve a PENDING booking: confirms it, creates a video meeting if the
// event type calls for one, and sends the invitee their real confirmation.
export async function approveBookingAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return;
  const id = String(formData.get("id") || "");

  const booking = await prisma.booking.findFirst({
    where: { id, userId: user.id, status: "PENDING" },
    include: { eventType: true, user: true, teamMember: { select: { name: true } } },
  });
  if (!booking) return;

  await prisma.booking.update({ where: { id: booking.id }, data: { status: "CONFIRMED" } });

  const businessTz = booking.user.timezone;
  const when = formatWhen(booking.startTime, businessTz);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const manageUrl = `${baseUrl}/booking/${booking.manageToken}`;
  const guests = parseGuests(booking.guests);

  // Create the video meeting now (deferred from request time, since we don't
  // want a calendar event for a request that might get declined).
  let meetingUrl: string | null = null;
  let meetingProvider: string | null = null;
  let locationText: string | null = null;
  if (booking.eventType.locationType === "GOOGLE_MEET") {
    const meet = await createMeetEvent({
      userId: booking.userId,
      summary: `${booking.eventType.title} — ${booking.inviteeName}`,
      description: `Booking with ${booking.user.businessName}. Manage: ${manageUrl}`,
      startUtc: booking.startTime,
      endUtc: booking.endTime,
      timeZone: businessTz,
      attendees: [
        { email: booking.inviteeEmail, name: booking.inviteeName },
        { email: booking.user.email, name: booking.user.businessName },
        ...guests.map((g) => ({ email: g.email, name: g.name })),
      ],
    });
    if (meet) {
      meetingUrl = meet.meetingUrl;
      meetingProvider = "google";
      locationText = meet.meetingUrl;
      await prisma.booking.update({
        where: { id: booking.id },
        data: { meetingUrl: meet.meetingUrl, calendarEventId: meet.calendarEventId, meetingProvider: "google" },
      });
    }
  } else if (booking.eventType.locationType === "ZOOM") {
    const meet = await createZoomMeeting({
      userId: booking.userId,
      topic: `${booking.eventType.title} — ${booking.inviteeName}`,
      startUtc: booking.startTime,
      endUtc: booking.endTime,
      timeZone: businessTz,
    });
    if (meet) {
      meetingUrl = meet.meetingUrl;
      meetingProvider = "zoom";
      locationText = meet.meetingUrl;
      await prisma.booking.update({
        where: { id: booking.id },
        data: { meetingUrl: meet.meetingUrl, calendarEventId: meet.meetingId, meetingProvider: "zoom" },
      });
    }
  } else if (booking.eventType.locationDetail) {
    locationText = booking.eventType.locationDetail;
  }

  const meetLine = meetingUrl ? `\nJoin: ${meetingUrl}` : locationText ? `\nWhere: ${locationText}` : "";
  const withWho = booking.teamMember?.name ?? null;

  const ics = buildIcs({
    uid: booking.manageToken ?? booking.id,
    sequence: 0,
    method: "REQUEST",
    start: booking.startTime,
    end: booking.endTime,
    title: `${booking.eventType.title} — ${booking.user.businessName}`,
    description: `Booking with ${booking.user.businessName}${withWho ? ` (with ${withWho})` : ""}.${meetingUrl ? ` Join: ${meetingUrl}.` : ""} Manage: ${manageUrl}`,
    organizerName: booking.user.businessName,
    organizerEmail: booking.user.email,
    attendeeName: booking.inviteeName,
    attendeeEmail: booking.inviteeEmail,
    extraAttendees: guests,
    location: locationText,
  });
  const icsAttachment = {
    filename: "invite.ics",
    content: ics,
    contentType: "text/calendar; charset=utf-8; method=REQUEST",
  };

  try {
    const inviteeEmail = await renderTemplate("booking.confirmed.invitee", {
      invitee_name: booking.inviteeName,
      business_name: booking.user.businessName,
      event_title: booking.eventType.title,
      when,
      timezone: businessTz,
      with_line: `${withWho ? `\nWith: ${withWho}` : ""}${meetLine}`,
      manage_url: manageUrl,
    });
    await sendEmail({
      to: booking.inviteeEmail,
      ...inviteeEmail,
      attachments: [icsAttachment],
      ...(booking.eventType.replyToEmail ? { replyTo: booking.eventType.replyToEmail } : {}),
    });
    for (const guest of guests) {
      await sendEmail({
        to: guest.email,
        ...inviteeEmail,
        attachments: [icsAttachment],
        ...(booking.eventType.replyToEmail ? { replyTo: booking.eventType.replyToEmail } : {}),
      });
    }
  } catch (err) {
    logger.error({ err, bookingId: booking.id }, "Failed to send approval email");
  }

  revalidatePath("/dashboard/bookings");
}

// Reject a PENDING booking: frees the slot (same as a cancellation) and
// tells the invitee to pick another time.
export async function rejectBookingAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return;
  const id = String(formData.get("id") || "");

  const booking = await prisma.booking.findFirst({
    where: { id, userId: user.id, status: "PENDING" },
    include: { eventType: true, user: true },
  });
  if (!booking) return;

  await prisma.booking.update({ where: { id: booking.id }, data: { status: "CANCELLED" } });

  try {
    const inviteeEmail = await renderTemplate("booking.declined.invitee", {
      invitee_name: booking.inviteeName,
      business_name: booking.user.businessName,
      event_title: booking.eventType.title,
      when: formatWhen(booking.startTime, booking.user.timezone),
    });
    await sendEmail({ to: booking.inviteeEmail, ...inviteeEmail });
  } catch (err) {
    logger.error({ err, bookingId: booking.id }, "Failed to send decline email");
  }

  revalidatePath("/dashboard/bookings");
}
