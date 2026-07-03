"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSlotsForDate, getTeamSlotsForDate, type Slot } from "@/lib/availability";
import { getTeamMemberBusyWindows, isFreeAt, pickRoundRobinMember } from "@/lib/team";
import { sendEmail } from "@/lib/email";
import { renderTemplate } from "@/lib/email-templates";
import { buildIcs } from "@/lib/ics";
import { formatWhen } from "@/lib/format";

type FullBooking = Prisma.BookingGetPayload<{
  include: { eventType: true; user: true };
}>;

async function describeAssignee(booking: FullBooking): Promise<string | null> {
  if (booking.eventType.assignmentMode === "ROUND_ROBIN" && booking.teamMemberId) {
    const m = await prisma.teamMember.findUnique({
      where: { id: booking.teamMemberId },
      select: { name: true },
    });
    return m?.name ?? null;
  }
  if (booking.eventType.assignmentMode === "COLLECTIVE") {
    const pool = await prisma.teamMember.findMany({
      where: { eventTypes: { some: { eventTypeId: booking.eventTypeId } } },
      select: { name: true },
    });
    return pool.map((m) => m.name).join(", ") || null;
  }
  return null;
}

// Build an .ics attachment for a booking update (reschedule) or cancellation.
function bookingIcs(
  booking: FullBooking,
  method: "REQUEST" | "CANCEL",
  sequence: number,
  withWho: string | null,
) {
  const ics = buildIcs({
    uid: booking.manageToken ?? booking.id,
    sequence,
    method,
    start: booking.startTime,
    end: booking.endTime,
    title: `${booking.eventType.title} — ${booking.user.businessName}`,
    description: `Booking with ${booking.user.businessName}${withWho ? ` (with ${withWho})` : ""}.`,
    organizerName: booking.user.businessName,
    organizerEmail: booking.user.email,
    attendeeName: booking.inviteeName,
    attendeeEmail: booking.inviteeEmail,
  });
  return {
    filename: "invite.ics",
    content: ics,
    contentType: `text/calendar; charset=utf-8; method=${method}`,
  };
}

// Cancel a booking via its manage token. Frees the slot (slots only count
// CONFIRMED bookings) and notifies both parties.
export async function cancelBookingAction(formData: FormData) {
  const token = String(formData.get("token") || "");
  const booking = await prisma.booking.findUnique({
    where: { manageToken: token },
    include: { eventType: true, user: true },
  });
  if (!booking || booking.status === "CANCELLED") return;

  const sequence = booking.sequence + 1;
  await prisma.booking.update({
    where: { id: booking.id },
    data: { status: "CANCELLED", sequence },
  });

  const when = formatWhen(booking.startTime, booking.user.timezone);
  const withWho = await describeAssignee(booking);
  const cancelIcs = bookingIcs(booking, "CANCEL", sequence, withWho);
  try {
    const inviteeEmail = await renderTemplate("booking.canceled.invitee", {
      invitee_name: booking.inviteeName,
      business_name: booking.user.businessName,
      event_title: booking.eventType.title,
      when,
    });
    await sendEmail({ to: booking.inviteeEmail, ...inviteeEmail, attachments: [cancelIcs] });

    const ownerEmail = await renderTemplate("booking.canceled.owner", {
      invitee_name: booking.inviteeName,
      event_title: booking.eventType.title,
      when,
    });
    await sendEmail({ to: booking.user.email, ...ownerEmail, attachments: [cancelIcs] });
  } catch (err) {
    console.error("Failed to send cancellation email", err);
  }

  revalidatePath(`/booking/${token}`);
  revalidatePath("/dashboard/bookings");
}

// Available slots for rescheduling this booking (same event type).
export async function fetchRescheduleSlots(
  token: string,
  date: string,
): Promise<Slot[]> {
  const booking = await prisma.booking.findUnique({
    where: { manageToken: token },
    include: { eventType: true, user: true },
  });
  if (!booking || booking.status === "CANCELLED") return [];

  if (booking.eventType.assignmentMode === "SOLO") {
    return getSlotsForDate({
      userId: booking.userId,
      timeZone: booking.user.timezone,
      durationMinutes: booking.eventType.durationMinutes,
      bufferMinutes: booking.eventType.bufferMinutes,
      date,
    });
  }

  const pool = await prisma.teamMember.findMany({
    where: { active: true, eventTypes: { some: { eventTypeId: booking.eventTypeId } } },
    select: { id: true },
  });
  return getTeamSlotsForDate({
    assignmentMode: booking.eventType.assignmentMode,
    pool,
    timeZone: booking.user.timezone,
    durationMinutes: booking.eventType.durationMinutes,
    bufferMinutes: booking.eventType.bufferMinutes,
    date,
  });
}

export type RescheduleResult =
  | { ok: true; when: string }
  | { ok: false; error: string };

// Move this booking to a new start time after re-checking availability.
export async function rescheduleBookingAction(input: {
  token: string;
  startUtc: string;
}): Promise<RescheduleResult> {
  const booking = await prisma.booking.findUnique({
    where: { manageToken: input.token },
    include: { eventType: true, user: true },
  });
  if (!booking || booking.status === "CANCELLED") {
    return { ok: false, error: "This booking can no longer be changed." };
  }

  const start = new Date(input.startUtc);
  if (Number.isNaN(start.getTime()) || start.getTime() < Date.now()) {
    return { ok: false, error: "That time is no longer available." };
  }
  const end = new Date(start.getTime() + booking.eventType.durationMinutes * 60_000);

  let assignedTeamMemberId: string | null = booking.teamMemberId;

  if (booking.eventType.assignmentMode === "SOLO") {
    const conflict = await prisma.booking.findFirst({
      where: {
        userId: booking.userId,
        status: "CONFIRMED",
        id: { not: booking.id },
        startTime: { lt: end },
        endTime: { gt: start },
      },
    });
    if (conflict) {
      return { ok: false, error: "Sorry, that time was just booked. Pick another." };
    }
  } else {
    const pool = await prisma.teamMember.findMany({
      where: { active: true, eventTypes: { some: { eventTypeId: booking.eventTypeId } } },
      select: { id: true, lastAssignedAt: true },
    });
    if (pool.length === 0) {
      return { ok: false, error: "Sorry, that time was just booked. Pick another." };
    }
    // Exclude this booking's own current slot from busy-window checks so
    // rescheduling to overlap your own old slot isn't treated as a conflict.
    const busyByMember = new Map(
      await Promise.all(
        pool.map(async (m) => {
          const windows = await getTeamMemberBusyWindows(m.id, start, end);
          return [m.id, windows.filter((w) => !(w.start.getTime() === booking.startTime.getTime() && w.end.getTime() === booking.endTime.getTime()))] as const;
        }),
      ),
    );
    const freeIds = new Set(
      pool.filter((m) => isFreeAt(busyByMember.get(m.id) ?? [], start, end)).map((m) => m.id),
    );

    if (booking.eventType.assignmentMode === "COLLECTIVE") {
      if (freeIds.size !== pool.length) {
        return { ok: false, error: "Sorry, that time was just booked. Pick another." };
      }
      assignedTeamMemberId = null;
    } else {
      const picked = pickRoundRobinMember(pool, freeIds);
      if (!picked) {
        return { ok: false, error: "Sorry, that time was just booked. Pick another." };
      }
      assignedTeamMemberId = picked.id;
    }
  }

  const sequence = booking.sequence + 1;
  await prisma.booking.update({
    where: { id: booking.id },
    data: { startTime: start, endTime: end, sequence, rescheduleCount: { increment: 1 }, teamMemberId: assignedTeamMemberId },
  });

  if (assignedTeamMemberId && assignedTeamMemberId !== booking.teamMemberId) {
    await prisma.teamMember.update({
      where: { id: assignedTeamMemberId },
      data: { lastAssignedAt: new Date() },
    });
  }

  const when = formatWhen(start, booking.user.timezone);
  // Rebuild the ICS with the new time + bumped sequence so calendars update.
  const withWho = await describeAssignee({ ...booking, teamMemberId: assignedTeamMemberId } as FullBooking);
  const updateIcs = bookingIcs(
    { ...booking, startTime: start, endTime: end },
    "REQUEST",
    sequence,
    withWho,
  );
  try {
    const inviteeEmail = await renderTemplate("booking.rescheduled.invitee", {
      invitee_name: booking.inviteeName,
      business_name: booking.user.businessName,
      event_title: booking.eventType.title,
      when,
      timezone: booking.user.timezone,
      with_line: withWho ? `\nWith: ${withWho}` : "",
    });
    await sendEmail({ to: booking.inviteeEmail, ...inviteeEmail, attachments: [updateIcs] });

    const ownerEmail = await renderTemplate("booking.rescheduled.owner", {
      invitee_name: booking.inviteeName,
      event_title: booking.eventType.title,
      when,
    });
    await sendEmail({ to: booking.user.email, ...ownerEmail, attachments: [updateIcs] });
  } catch (err) {
    console.error("Failed to send reschedule email", err);
  }

  revalidatePath(`/booking/${input.token}`);
  return { ok: true, when };
}
