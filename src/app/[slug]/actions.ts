"use server";

import { prisma } from "@/lib/prisma";
import { getSlotsForDate, getTeamSlotsForDate, type Slot } from "@/lib/availability";
import { getTeamMemberBusyWindows, isFreeAt, pickRoundRobinMember } from "@/lib/team";
import { sendEmail } from "@/lib/email";
import { renderTemplate } from "@/lib/email-templates";
import { buildIcs } from "@/lib/ics";
import { parseQuestions } from "@/lib/intake";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { formatWhen } from "@/lib/format";

// Validate an IANA timezone string; returns it or null.
function safeTimezone(tz?: string | null): string | null {
  if (!tz) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return null;
  }
}

// Fetch available slots for an event type on a given date (YYYY-MM-DD).
export async function fetchSlotsAction(
  eventTypeId: string,
  date: string,
): Promise<Slot[]> {
  const eventType = await prisma.eventType.findUnique({
    where: { id: eventTypeId },
    include: { user: true },
  });
  if (!eventType || !eventType.active) return [];
  if (eventType.user.suspended || eventType.user.deletedAt) return [];

  if (eventType.assignmentMode === "SOLO") {
    return getSlotsForDate({
      userId: eventType.userId,
      timeZone: eventType.user.timezone,
      durationMinutes: eventType.durationMinutes,
      bufferMinutes: eventType.bufferMinutes,
      date,
      maxPerDay: eventType.maxPerDay,
      eventTypeId: eventType.id,
    });
  }

  const pool = await prisma.teamMember.findMany({
    where: { active: true, eventTypes: { some: { eventTypeId: eventType.id } } },
    select: { id: true },
  });
  return getTeamSlotsForDate({
    assignmentMode: eventType.assignmentMode,
    pool,
    timeZone: eventType.user.timezone,
    durationMinutes: eventType.durationMinutes,
    bufferMinutes: eventType.bufferMinutes,
    date,
    maxPerDay: eventType.maxPerDay,
    eventTypeId: eventType.id,
  });
}

export type BookingResult =
  | { ok: true; when: string; manageUrl: string }
  | { ok: false; error: string };

// Create a booking for an event type at a specific UTC start time.
export async function createBookingAction(input: {
  eventTypeId: string;
  startUtc: string;
  name: string;
  email: string;
  notes?: string;
  viewerTimezone?: string;
  answers?: { label: string; value: string }[];
}): Promise<BookingResult> {
  if (!rateLimit(`book:${await clientIp()}`, 10, 600_000)) {
    return { ok: false, error: "Too many booking attempts. Please wait a few minutes." };
  }
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (!name || !email) return { ok: false, error: "Name and email are required." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, error: "Please enter a valid email address." };
  }

  const eventType = await prisma.eventType.findUnique({
    where: { id: input.eventTypeId },
    include: { user: true },
  });
  if (!eventType || !eventType.active) {
    return { ok: false, error: "This event type is no longer available." };
  }
  if (eventType.user.suspended || eventType.user.deletedAt) {
    return { ok: false, error: "This business is not currently accepting bookings." };
  }

  const start = new Date(input.startUtc);
  if (Number.isNaN(start.getTime()) || start.getTime() < Date.now()) {
    return { ok: false, error: "That time is no longer available." };
  }
  const end = new Date(start.getTime() + eventType.durationMinutes * 60_000);

  // Enforce the daily cap server-side (the slot UI also hides full days).
  if (eventType.maxPerDay != null) {
    const dayStart = new Date(start);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime() + 86_400_000);
    const dayCount = await prisma.booking.count({
      where: {
        eventTypeId: eventType.id,
        status: "CONFIRMED",
        startTime: { gte: dayStart, lt: dayEnd },
      },
    });
    if (dayCount >= eventType.maxPerDay) {
      return { ok: false, error: "This day is fully booked. Please pick another." };
    }
  }

  // Validate answers to required intake questions.
  const questions = parseQuestions(eventType.intakeQuestions);
  const answers = (input.answers ?? []).map((a) => ({
    label: String(a.label),
    value: String(a.value ?? "").trim(),
  }));
  for (const q of questions) {
    if (q.required) {
      const a = answers.find((x) => x.label === q.label);
      if (!a || a.value === "") {
        return { ok: false, error: `Please answer: ${q.label}` };
      }
    }
  }
  const answersJson = answers.some((a) => a.value !== "")
    ? JSON.stringify(answers.filter((a) => a.value !== ""))
    : null;

  let assignedTeamMemberId: string | null = null;
  let bookingId: string;
  const manageToken = crypto.randomUUID();

  try {
    bookingId = await prisma.$transaction(async (tx) => {
      if (eventType.assignmentMode === "SOLO") {
        const conflict = await tx.booking.findFirst({
          where: {
            userId: eventType.userId,
            status: "CONFIRMED",
            startTime: { lt: end },
            endTime: { gt: start },
          },
        });
        if (conflict) throw new Error("SLOT_TAKEN");
      } else {
        const pool = await tx.teamMember.findMany({
          where: { active: true, eventTypes: { some: { eventTypeId: eventType.id } } },
          select: { id: true, lastAssignedAt: true },
        });
        if (pool.length === 0) throw new Error("SLOT_TAKEN");

        const busyByMember = new Map(
          await Promise.all(
            pool.map(async (m) => [m.id, await getTeamMemberBusyWindows(m.id, start, end)] as const),
          ),
        );
        const freeIds = new Set(
          pool.filter((m) => isFreeAt(busyByMember.get(m.id) ?? [], start, end)).map((m) => m.id),
        );

        if (eventType.assignmentMode === "COLLECTIVE") {
          if (freeIds.size !== pool.length) throw new Error("SLOT_TAKEN");
        } else {
          const picked = pickRoundRobinMember(pool, freeIds);
          if (!picked) throw new Error("SLOT_TAKEN");
          assignedTeamMemberId = picked.id;
        }
      }

      const created = await tx.booking.create({
        data: {
          userId: eventType.userId,
          eventTypeId: eventType.id,
          inviteeName: name,
          inviteeEmail: email,
          notes: input.notes?.trim() || null,
          startTime: start,
          endTime: end,
          manageToken,
          answers: answersJson,
          teamMemberId: assignedTeamMemberId,
        },
      });

      if (assignedTeamMemberId) {
        await tx.teamMember.update({
          where: { id: assignedTeamMemberId },
          data: { lastAssignedAt: new Date() },
        });
      }

      return created.id;
    });
  } catch (err) {
    if (err instanceof Error && err.message === "SLOT_TAKEN") {
      return { ok: false, error: "Sorry, that time was just booked. Pick another." };
    }
    throw err;
  }
  void bookingId;

  const businessTz = eventType.user.timezone;
  const viewerTz = safeTimezone(input.viewerTimezone) ?? businessTz;
  const inviteeWhen = formatWhen(start, viewerTz);
  const ownerWhen = formatWhen(start, businessTz);

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const manageUrl = `${baseUrl}/booking/${manageToken}`;

  let withWho: string | null = null;
  if (eventType.assignmentMode === "ROUND_ROBIN" && assignedTeamMemberId) {
    const m = await prisma.teamMember.findUnique({
      where: { id: assignedTeamMemberId },
      select: { name: true },
    });
    withWho = m?.name ?? null;
  } else if (eventType.assignmentMode === "COLLECTIVE") {
    const pool = await prisma.teamMember.findMany({
      where: { eventTypes: { some: { eventTypeId: eventType.id } } },
      select: { name: true },
    });
    withWho = pool.map((m) => m.name).join(", ") || null;
  }

  const ics = buildIcs({
    uid: manageToken,
    sequence: 0,
    method: "REQUEST",
    start,
    end,
    title: `${eventType.title} — ${eventType.user.businessName}`,
    description: `Booking with ${eventType.user.businessName}${withWho ? ` (with ${withWho})` : ""}. Manage: ${manageUrl}`,
    organizerName: eventType.user.businessName,
    organizerEmail: eventType.user.email,
    attendeeName: name,
    attendeeEmail: email,
  });
  const icsAttachment = {
    filename: "invite.ics",
    content: ics,
    contentType: "text/calendar; charset=utf-8; method=REQUEST",
  };

  // Notify invitee and business owner. Failures here must not block the booking.
  try {
    const inviteeEmail = await renderTemplate("booking.confirmed.invitee", {
      invitee_name: name,
      business_name: eventType.user.businessName,
      event_title: eventType.title,
      when: inviteeWhen,
      timezone: viewerTz,
      with_line: withWho ? `\nWith: ${withWho}` : "",
      manage_url: manageUrl,
    });
    await sendEmail({ to: email, ...inviteeEmail, attachments: [icsAttachment] });

    const answerLines = answersJson
      ? "\n" +
        answers
          .filter((a) => a.value !== "")
          .map((a) => `${a.label}: ${a.value}`)
          .join("\n")
      : "";
    const ownerEmail = await renderTemplate("booking.created.owner", {
      invitee_name: name,
      invitee_email: email,
      event_title: eventType.title,
      when: ownerWhen,
      timezone: businessTz,
      extra: `${input.notes ? `\nNotes: ${input.notes}` : ""}${answerLines}`,
    });
    await sendEmail({ to: eventType.user.email, ...ownerEmail, attachments: [icsAttachment] });
  } catch (err) {
    console.error("Failed to send booking email", err);
  }

  return { ok: true, when: inviteeWhen, manageUrl };
}
