"use server";

import { prisma } from "@/lib/prisma";
import {
  getSlotsForDate,
  getTeamSlotsForDate,
  weekOrMonthCapHit,
  utcToZonedYmd,
  type Slot,
} from "@/lib/availability";
import { getTeamMemberBusyWindows, isFreeAt, pickRoundRobinMember } from "@/lib/team";
import { sendEmail } from "@/lib/email";
import { renderTemplate } from "@/lib/email-templates";
import { buildIcs } from "@/lib/ics";
import { createMeetEvent } from "@/lib/google-calendar";
import { createZoomMeeting } from "@/lib/zoom";
import { parseQuestions } from "@/lib/intake";
import { sanitizeGuests, type Guest } from "@/lib/guests";
import { BLOCKING_STATUSES } from "@/lib/booking-status";
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
  if (!(await rateLimit(`slots:${await clientIp()}`, 60, 60_000))) return [];
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
      maxPerWeek: eventType.maxPerWeek,
      maxPerMonth: eventType.maxPerMonth,
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
    maxPerWeek: eventType.maxPerWeek,
    maxPerMonth: eventType.maxPerMonth,
    eventTypeId: eventType.id,
  });
}

export type BookingResult =
  | {
      ok: true;
      when: string;
      manageUrl: string;
      meetingUrl?: string | null;
      meetingProvider?: string | null;
      redirectUrl?: string | null;
      // True when the event type requires owner approval — the booking is
      // PENDING, not yet confirmed, and has no meeting link yet.
      pending?: boolean;
    }
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
  guests?: Guest[];
}): Promise<BookingResult> {
  if (!(await rateLimit(`book:${await clientIp()}`, 10, 600_000))) {
    return { ok: false, error: "Too many booking attempts. Please wait a few minutes." };
  }
  const name = input.name.trim().slice(0, 200);
  const email = input.email.trim().toLowerCase().slice(0, 320);
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
        status: { in: BLOCKING_STATUSES },
        startTime: { gte: dayStart, lt: dayEnd },
      },
    });
    if (dayCount >= eventType.maxPerDay) {
      return { ok: false, error: "This day is fully booked. Please pick another." };
    }
  }

  // Enforce weekly/monthly caps server-side, in the business's own timezone
  // (matches the slot UI, which hides the whole day once either cap is hit).
  if (eventType.maxPerWeek != null || eventType.maxPerMonth != null) {
    const { year, month, day } = utcToZonedYmd(start, eventType.user.timezone);
    const capped = await weekOrMonthCapHit({
      eventTypeId: eventType.id,
      year,
      month,
      day,
      timeZone: eventType.user.timezone,
      maxPerWeek: eventType.maxPerWeek,
      maxPerMonth: eventType.maxPerMonth,
    });
    if (capped) {
      return { ok: false, error: "This time is no longer available. Please pick another." };
    }
  }

  // Validate answers to required intake questions.
  const questions = parseQuestions(eventType.intakeQuestions);
  const answers = (input.answers ?? []).slice(0, 50).map((a) => ({
    label: String(a.label).slice(0, 500),
    value: String(a.value ?? "").trim().slice(0, 2000),
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

  const guests = sanitizeGuests(input.guests ?? [], email);
  const guestsJson = guests.length ? JSON.stringify(guests) : null;

  let assignedTeamMemberId: string | null = null;
  let bookingId: string;
  const manageToken = `booked-${crypto.randomUUID()}`;

  try {
    bookingId = await prisma.$transaction(async (tx) => {
      if (eventType.assignmentMode === "SOLO") {
        const conflict = await tx.booking.findFirst({
          where: {
            userId: eventType.userId,
            status: { in: BLOCKING_STATUSES },
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
          notes: input.notes?.trim().slice(0, 2000) || null,
          startTime: start,
          endTime: end,
          manageToken,
          answers: answersJson,
          guests: guestsJson,
          teamMemberId: assignedTeamMemberId,
          status: eventType.requiresApproval ? "PENDING" : "CONFIRMED",
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

  const businessTz = eventType.user.timezone;
  const viewerTz = safeTimezone(input.viewerTimezone) ?? businessTz;
  const inviteeWhen = formatWhen(start, viewerTz);
  const ownerWhen = formatWhen(start, businessTz);

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const manageUrl = `${baseUrl}/booking/${manageToken}`;

  // Pending bookings skip meeting-link creation and the full confirmation
  // email — those happen at approval time — and instead notify both parties
  // that a decision is needed.
  if (eventType.requiresApproval) {
    try {
      const inviteeEmail = await renderTemplate("booking.pending.invitee", {
        invitee_name: name,
        business_name: eventType.user.businessName,
        event_title: eventType.title,
        when: inviteeWhen,
        timezone: viewerTz,
      });
      await sendEmail({
        to: email,
        ...inviteeEmail,
        ...(eventType.replyToEmail ? { replyTo: eventType.replyToEmail } : {}),
      });

      const ownerEmail = await renderTemplate("booking.pending.owner", {
        invitee_name: name,
        invitee_email: email,
        event_title: eventType.title,
        when: ownerWhen,
        timezone: businessTz,
        review_url: `${baseUrl}/dashboard/bookings`,
      });
      await sendEmail({ to: eventType.user.email, ...ownerEmail });
    } catch (err) {
      console.error("Failed to send pending-booking email", err);
    }

    return { ok: true, when: inviteeWhen, manageUrl, pending: true };
  }

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

  // Resolve the meeting location. For GOOGLE_MEET/ZOOM, create a meeting on
  // the owner's connected account and capture the link. Any failure here
  // degrades gracefully — the booking is already committed, so we just fall
  // through with no link rather than erroring the invitee out.
  let meetingUrl: string | null = null;
  let meetingProvider: string | null = null;
  let locationText: string | null = null;
  if (eventType.locationType === "GOOGLE_MEET") {
    const meet = await createMeetEvent({
      userId: eventType.userId,
      summary: `${eventType.title} — ${name}`,
      description: `Booking with ${eventType.user.businessName}. Manage: ${manageUrl}`,
      startUtc: start,
      endUtc: end,
      timeZone: businessTz,
      attendees: [
        { email, name },
        { email: eventType.user.email, name: eventType.user.businessName },
        ...guests.map((g) => ({ email: g.email, name: g.name })),
      ],
    });
    if (meet) {
      meetingUrl = meet.meetingUrl;
      meetingProvider = "google";
      locationText = meet.meetingUrl;
      await prisma.booking.update({
        where: { id: bookingId },
        data: { meetingUrl: meet.meetingUrl, calendarEventId: meet.calendarEventId, meetingProvider: "google" },
      });
    }
  } else if (eventType.locationType === "ZOOM") {
    const meet = await createZoomMeeting({
      userId: eventType.userId,
      topic: `${eventType.title} — ${name}`,
      startUtc: start,
      endUtc: end,
      timeZone: businessTz,
    });
    if (meet) {
      meetingUrl = meet.meetingUrl;
      meetingProvider = "zoom";
      locationText = meet.meetingUrl;
      await prisma.booking.update({
        where: { id: bookingId },
        data: { meetingUrl: meet.meetingUrl, calendarEventId: meet.meetingId, meetingProvider: "zoom" },
      });
    }
  } else if (eventType.locationDetail) {
    locationText = eventType.locationDetail;
  }

  // A "\n…" fragment appended to the existing with_line/extra template vars so
  // the location/link surfaces in both emails and the .ics without needing a
  // template migration (existing DB rows already render with_line/extra).
  const meetLine = meetingUrl
    ? `\nJoin: ${meetingUrl}`
    : locationText
      ? `\nWhere: ${locationText}`
      : "";

  const ics = buildIcs({
    uid: manageToken,
    sequence: 0,
    method: "REQUEST",
    start,
    end,
    title: `${eventType.title} — ${eventType.user.businessName}`,
    description: `Booking with ${eventType.user.businessName}${withWho ? ` (with ${withWho})` : ""}.${meetingUrl ? ` Join: ${meetingUrl}.` : ""} Manage: ${manageUrl}`,
    organizerName: eventType.user.businessName,
    organizerEmail: eventType.user.email,
    attendeeName: name,
    attendeeEmail: email,
    extraAttendees: guests,
    location: locationText,
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
      with_line: `${withWho ? `\nWith: ${withWho}` : ""}${meetLine}`,
      manage_url: manageUrl,
    });
    await sendEmail({
      to: email,
      ...inviteeEmail,
      attachments: [icsAttachment],
      ...(eventType.replyToEmail ? { replyTo: eventType.replyToEmail } : {}),
    });
    for (const guest of guests) {
      await sendEmail({
        to: guest.email,
        ...inviteeEmail,
        attachments: [icsAttachment],
        ...(eventType.replyToEmail ? { replyTo: eventType.replyToEmail } : {}),
      });
    }

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
      extra: `${meetLine}${input.notes ? `\nNotes: ${input.notes}` : ""}${answerLines}`,
    });
    await sendEmail({ to: eventType.user.email, ...ownerEmail, attachments: [icsAttachment] });
  } catch (err) {
    console.error("Failed to send booking email", err);
  }

  return {
    ok: true,
    when: inviteeWhen,
    manageUrl,
    meetingUrl,
    meetingProvider,
    redirectUrl: eventType.confirmationRedirectUrl,
  };
}

// Create a booking against a GROUP event type's Session. The seat claim is
// atomic — one UPDATE statement, verified by the database, no race between
// "count" and "insert." If two invitees race for the last seat, the second's
// UPDATE affects zero rows and we return SESSION_FULL.
export async function createGroupBookingAction(input: {
  eventTypeId: string;
  sessionId: string;
  name: string;
  email: string;
  notes?: string;
  viewerTimezone?: string;
  answers?: { label: string; value: string }[];
}): Promise<BookingResult> {
  if (!(await rateLimit(`book:${await clientIp()}`, 10, 600_000))) {
    return { ok: false, error: "Too many booking attempts. Please wait a few minutes." };
  }
  const name = input.name.trim().slice(0, 200);
  const email = input.email.trim().toLowerCase().slice(0, 320);
  if (!name || !email) return { ok: false, error: "Name and email are required." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, error: "Please enter a valid email address." };
  }

  const eventType = await prisma.eventType.findUnique({
    where: { id: input.eventTypeId },
    include: { user: true },
  });
  if (!eventType || !eventType.active || eventType.capacity == null) {
    return { ok: false, error: "This event type is no longer available." };
  }
  if (eventType.user.suspended || eventType.user.deletedAt) {
    return { ok: false, error: "This business is not currently accepting bookings." };
  }

  // Validate required intake answers up front so we don't waste a seat claim.
  const questions = parseQuestions(eventType.intakeQuestions);
  const answers = (input.answers ?? []).slice(0, 50).map((a) => ({
    label: String(a.label).slice(0, 500),
    value: String(a.value ?? "").trim().slice(0, 2000),
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

  const manageToken = `booked-${crypto.randomUUID()}`;

  // Everything DB-side runs in one transaction: atomic seat claim, then the
  // booking insert. If the insert fails for any reason, the seat claim rolls
  // back, so seatsTaken can never drift above the true count.
  let session: {
    id: string;
    startTime: Date;
    durationMinutes: number;
    meetingUrl: string | null;
    meetingProvider: string | null;
    cancelled: boolean;
  };
  let bookingId: string;
  try {
    const result = await prisma.$transaction(async (tx) => {
      // Atomic increment: the DB checks seatsTaken < capacity as part of the
      // UPDATE, so two racing requests can't both see "one seat left" and both
      // succeed — the second one matches zero rows. This is enforced at the
      // engine level, not by our application logic.
      const claimed: number = await tx.$executeRaw`
        UPDATE "Session"
        SET "seatsTaken" = "seatsTaken" + 1, "updatedAt" = NOW()
        WHERE id = ${input.sessionId}
          AND "eventTypeId" = ${eventType.id}
          AND cancelled = false
          AND "startTime" > NOW()
          AND "seatsTaken" < capacity
      `;
      if (claimed === 0) throw new Error("SESSION_UNAVAILABLE");

      const s = await tx.session.findUnique({ where: { id: input.sessionId } });
      if (!s) throw new Error("SESSION_UNAVAILABLE");

      const created = await tx.booking.create({
        data: {
          userId: eventType.userId,
          eventTypeId: eventType.id,
          sessionId: s.id,
          inviteeName: name,
          inviteeEmail: email,
          notes: input.notes?.trim().slice(0, 2000) || null,
          startTime: s.startTime,
          endTime: new Date(s.startTime.getTime() + s.durationMinutes * 60_000),
          manageToken,
          answers: answersJson,
          status: eventType.requiresApproval ? "PENDING" : "CONFIRMED",
          // Denormalize the session's meeting fields onto the booking so the
          // existing manage/dashboard views (which read booking.meetingUrl)
          // Just Work without needing to join through session.
          meetingUrl: s.meetingUrl,
          meetingProvider: s.meetingProvider,
        },
      });
      return { session: s, bookingId: created.id };
    });
    session = result.session;
    bookingId = result.bookingId;
    void bookingId;
  } catch (err) {
    if (err instanceof Error && err.message === "SESSION_UNAVAILABLE") {
      return { ok: false, error: "Sorry, this session just filled up or was canceled." };
    }
    throw err;
  }

  const businessTz = eventType.user.timezone;
  const viewerTz = safeTimezone(input.viewerTimezone) ?? businessTz;
  const inviteeWhen = formatWhen(session.startTime, viewerTz);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const manageUrl = `${baseUrl}/booking/${manageToken}`;

  const meetLine = session.meetingUrl
    ? `\nJoin: ${session.meetingUrl}`
    : eventType.locationDetail
      ? `\nWhere: ${eventType.locationDetail}`
      : "";

  const ics = buildIcs({
    uid: manageToken,
    sequence: 0,
    method: "REQUEST",
    start: session.startTime,
    end: new Date(session.startTime.getTime() + session.durationMinutes * 60_000),
    title: `${eventType.title} — ${eventType.user.businessName}`,
    description: `Booking with ${eventType.user.businessName}.${session.meetingUrl ? ` Join: ${session.meetingUrl}.` : ""} Manage: ${manageUrl}`,
    organizerName: eventType.user.businessName,
    organizerEmail: eventType.user.email,
    attendeeName: name,
    attendeeEmail: email,
    location: session.meetingUrl,
  });
  const icsAttachment = {
    filename: "invite.ics",
    content: ics,
    contentType: "text/calendar; charset=utf-8; method=REQUEST",
  };

  // Notify invitee and business owner. Failures here must not block the booking.
  try {
    const inviteeEmail = await renderTemplate(
      eventType.requiresApproval ? "booking.pending.invitee" : "booking.confirmed.invitee",
      {
        invitee_name: name,
        business_name: eventType.user.businessName,
        event_title: eventType.title,
        when: inviteeWhen,
        timezone: viewerTz,
        with_line: meetLine,
        manage_url: manageUrl,
      },
    );
    await sendEmail({
      to: email,
      ...inviteeEmail,
      // Skip the ICS for pending bookings — no real event yet.
      ...(eventType.requiresApproval ? {} : { attachments: [icsAttachment] }),
      ...(eventType.replyToEmail ? { replyTo: eventType.replyToEmail } : {}),
    });

    const ownerWhen = formatWhen(session.startTime, businessTz);
    const ownerEmail = await renderTemplate(
      eventType.requiresApproval ? "booking.pending.owner" : "booking.created.owner",
      {
        invitee_name: name,
        invitee_email: email,
        event_title: eventType.title,
        when: ownerWhen,
        timezone: businessTz,
        extra: `${meetLine}${input.notes ? `\nNotes: ${input.notes}` : ""}`,
        review_url: `${baseUrl}/dashboard/bookings`,
      },
    );
    await sendEmail({
      to: eventType.user.email,
      ...ownerEmail,
      ...(eventType.requiresApproval ? {} : { attachments: [icsAttachment] }),
    });
  } catch (err) {
    console.error("Failed to send group booking email", err);
  }

  return {
    ok: true,
    when: inviteeWhen,
    manageUrl,
    meetingUrl: session.meetingUrl,
    meetingProvider: session.meetingProvider,
    redirectUrl: eventType.confirmationRedirectUrl,
    pending: eventType.requiresApproval,
  };
}
