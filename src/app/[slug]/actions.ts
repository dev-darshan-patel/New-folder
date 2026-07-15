"use server";

import { prisma } from "@/lib/prisma";
import {
  getSlotsForDate,
  getTeamSlotsForDate,
  weekOrMonthCapHit,
  utcToZonedYmd,
  generateWeeklyOccurrences,
  isBlockedByDateOverride,
  type Slot,
} from "@/lib/availability";
import { getTeamMemberBusyWindows, isFreeAt, pickRoundRobinMember } from "@/lib/team";
import { sendEmail } from "@/lib/email";
import { renderTemplate } from "@/lib/email-templates";
import { buildIcs } from "@/lib/ics";
import { createMeetEvent, getGoogleBusyWindows } from "@/lib/google-calendar";
import { createZoomMeeting } from "@/lib/zoom";
import { parseQuestions } from "@/lib/intake";
import { sanitizeGuests, type Guest } from "@/lib/guests";
import { BLOCKING_STATUSES } from "@/lib/booking-status";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { formatWhen } from "@/lib/format";
import { getPaymentAdapter } from "@/lib/payments/registry";
import { planHasFeature } from "@/lib/plans";
import logger from "@/lib/logger";

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
      // Present when this was a recurring series booking: the count booked and
      // each occurrence's formatted date/time (invitee's timezone).
      series?: { total: number; whenList: string[] };
      // Feature 4.5: when set, the caller MUST redirect the invitee to this
      // provider-hosted checkout URL. Booking is PENDING_PAYMENT until the
      // provider webhook confirms.
      checkoutUrl?: string;
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

  if (await isBlockedByDateOverride(eventType.userId, start, end, eventType.user.timezone)) {
    return { ok: false, error: "This time is no longer available. Please pick another." };
  }

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

  const guestInvitesAllowed = await planHasFeature(eventType.user.plan, "guest_invites");
  const guests = guestInvitesAllowed ? sanitizeGuests(input.guests ?? [], email) : [];
  const guestsJson = guests.length ? JSON.stringify(guests) : null;

  // Re-check the owner's real Google Calendar right before writing — the slot
  // UI already hid busy times, but this closes the gap between "page loaded"
  // and "form submitted" (same reasoning as the internal overlap re-check).
  if (eventType.assignmentMode === "SOLO") {
    const googleBusy = await getGoogleBusyWindows(eventType.userId, start, end);
    if (googleBusy.some((b) => start < b.end && end > b.start)) {
      return { ok: false, error: "Sorry, that time was just booked. Pick another." };
    }
  }

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

  // Paid booking (Feature 4.5). Everything above is unchanged — we still hold
  // the slot via the same transaction — but instead of firing the confirmation
  // email or creating a video link, we flip the booking to PENDING_PAYMENT and
  // send the invitee to the payment provider. Webhook + return route take it
  // from CONFIRMED there (Phase 4.6+). Approval-required event types can't
  // also be paid (product decision — one gating flow at a time), so the
  // requiresApproval branch below is skipped for paid bookings.
  if (
    eventType.priceCents != null &&
    eventType.currency &&
    eventType.assignmentMode === "SOLO" &&
    eventType.user.activePaymentProvider &&
    !eventType.requiresApproval
  ) {
    const provider = eventType.user.activePaymentProvider as "STRIPE" | "RAZORPAY";
    try {
      const adapter = getPaymentAdapter(provider);
      const checkout = await adapter.createCheckout({
        bookingId,
        tenantId: eventType.userId,
        invitee: { email, name },
        price: { amount: eventType.priceCents, currency: eventType.currency },
        successUrl: `${baseUrl}/booking/${manageToken}?payment=success`,
        cancelUrl: `${baseUrl}/${eventType.user.slug}/${eventType.slug}?payment=cancelled`,
        description: `${eventType.title} — ${eventType.user.businessName}`,
      });
      await prisma.booking.update({
        where: { id: bookingId },
        data: {
          status: "PENDING_PAYMENT",
          paymentProvider: provider,
          providerPaymentId: checkout.providerPaymentId,
          amountCents: eventType.priceCents,
          currency: eventType.currency,
          paymentStatus: "PENDING",
        },
      });
      return {
        ok: true,
        when: inviteeWhen,
        manageUrl,
        checkoutUrl: checkout.url,
      };
    } catch (err) {
      // Roll the hold back so a broken provider doesn't wedge the slot.
      await prisma.booking.update({
        where: { id: bookingId },
        data: { status: "CANCELLED" },
      });
      logger.error({ err, bookingId, provider }, "Failed to create checkout for paid booking");
      return { ok: false, error: "Payment provider was unreachable. Please try again." };
    }
  }

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
      logger.error({ err, eventTypeId: eventType.id }, "Failed to send pending-booking email");
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
    logger.error({ err, eventTypeId: eventType.id }, "Failed to send booking email");
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

// Allowed occurrence counts for a weekly recurring series.
const RECURRING_COUNTS = new Set([2, 4, 8]);

// Create a WEEKLY recurring series: N independent Booking rows, same weekday/
// time, sharing a random seriesId. All-or-nothing — if ANY occurrence conflicts
// (overlap or a per-event-type cap), zero rows are inserted and the error names
// the offending date. Only for classic 1:1 SOLO event types that opted in.
export async function createRecurringBookingAction(input: {
  eventTypeId: string;
  startUtc: string; // first occurrence
  count: number; // 2 | 4 | 8
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
  if (!RECURRING_COUNTS.has(input.count)) {
    return { ok: false, error: "Invalid recurrence length." };
  }

  const eventType = await prisma.eventType.findUnique({
    where: { id: input.eventTypeId },
    include: { user: true },
  });
  if (!eventType || !eventType.active) {
    return { ok: false, error: "This event type is no longer available." };
  }
  // Recurring is only valid for opted-in, classic 1:1, SOLO event types.
  if (!eventType.allowRecurring || eventType.capacity != null || eventType.assignmentMode !== "SOLO") {
    return { ok: false, error: "This event type can't be booked as a series." };
  }
  if (eventType.user.suspended || eventType.user.deletedAt) {
    return { ok: false, error: "This business is not currently accepting bookings." };
  }

  const first = new Date(input.startUtc);
  if (Number.isNaN(first.getTime()) || first.getTime() < Date.now()) {
    return { ok: false, error: "That time is no longer available." };
  }

  const businessTz = eventType.user.timezone;
  const occurrences = generateWeeklyOccurrences({
    firstStartUtc: first,
    count: input.count,
    timeZone: businessTz,
    durationMinutes: eventType.durationMinutes,
  });

  // Validate required intake answers once (shared across occurrences).
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
  const guestInvitesAllowed = await planHasFeature(eventType.user.plan, "guest_invites");
  const guests = guestInvitesAllowed ? sanitizeGuests(input.guests ?? [], email) : [];
  const guestsJson = guests.length ? JSON.stringify(guests) : null;

  const viewerTz = safeTimezone(input.viewerTimezone) ?? businessTz;
  const dateFmt = (d: Date) =>
    new Intl.DateTimeFormat("en-US", { timeZone: businessTz, dateStyle: "medium" }).format(d);

  // Pre-check caps per occurrence, counting this series' own earlier occurrences
  // too (a weekly series inherently adds one booking per week/day/month). Cheap
  // early failure before we open the transaction.
  const seriesDayCounts = new Map<string, number>();
  const seriesWeekMonthDates = occurrences.map((o) => utcToZonedYmd(o.start, businessTz));
  for (let i = 0; i < occurrences.length; i++) {
    const o = occurrences[i];
    if (await isBlockedByDateOverride(eventType.userId, o.start, o.end, businessTz)) {
      return { ok: false, error: `${dateFmt(o.start)} is no longer available — the series wasn't booked.` };
    }
    // Daily cap
    if (eventType.maxPerDay != null) {
      const dayStart = new Date(o.start);
      dayStart.setUTCHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart.getTime() + 86_400_000);
      const dayKey = dayStart.toISOString();
      const existing = await prisma.booking.count({
        where: {
          eventTypeId: eventType.id,
          status: { in: BLOCKING_STATUSES },
          startTime: { gte: dayStart, lt: dayEnd },
        },
      });
      const withinSeries = seriesDayCounts.get(dayKey) ?? 0;
      if (existing + withinSeries >= eventType.maxPerDay) {
        return { ok: false, error: `${dateFmt(o.start)} is fully booked — the series wasn't booked.` };
      }
      seriesDayCounts.set(dayKey, withinSeries + 1);
    }
    // Weekly/monthly caps. Note: a weekly series lands one occurrence per week,
    // so maxPerWeek is effectively a "does this event type already have a
    // booking that week" check — the per-occurrence existing-count check handles
    // it correctly since each occurrence is in a distinct week.
    if (eventType.maxPerWeek != null || eventType.maxPerMonth != null) {
      const ymd = seriesWeekMonthDates[i];
      const capped = await weekOrMonthCapHit({
        eventTypeId: eventType.id,
        year: ymd.year,
        month: ymd.month,
        day: ymd.day,
        timeZone: businessTz,
        maxPerWeek: eventType.maxPerWeek,
        maxPerMonth: eventType.maxPerMonth,
      });
      if (capped) {
        return { ok: false, error: `${dateFmt(o.start)} is no longer available — the series wasn't booked.` };
      }
    }
  }

  // Re-check the owner's real Google Calendar for every occurrence — same
  // reasoning as the single-booking path above.
  for (const o of occurrences) {
    const googleBusy = await getGoogleBusyWindows(eventType.userId, o.start, o.end);
    if (googleBusy.some((b) => o.start < b.end && o.end > b.start)) {
      return { ok: false, error: `${dateFmt(o.start)} is no longer available — the series wasn't booked.` };
    }
  }

  const seriesId = crypto.randomUUID();
  // One token per occurrence (preserves the 1:1 manageToken invariant).
  const tokens = occurrences.map(() => `booked-${crypto.randomUUID()}`);
  const status = eventType.requiresApproval ? "PENDING" : "CONFIRMED";

  // Single transaction: re-check overlap for EVERY occurrence, then insert all.
  // First conflict rolls back the whole series (all-or-nothing).
  let createdIds: string[];
  try {
    createdIds = await prisma.$transaction(async (tx) => {
      for (const o of occurrences) {
        const conflict = await tx.booking.findFirst({
          where: {
            userId: eventType.userId,
            status: { in: BLOCKING_STATUSES },
            startTime: { lt: o.end },
            endTime: { gt: o.start },
          },
        });
        if (conflict) throw new Error(`SLOT_TAKEN:${o.start.toISOString()}`);
      }
      const ids: string[] = [];
      for (let i = 0; i < occurrences.length; i++) {
        const created = await tx.booking.create({
          data: {
            userId: eventType.userId,
            eventTypeId: eventType.id,
            inviteeName: name,
            inviteeEmail: email,
            notes: input.notes?.trim().slice(0, 2000) || null,
            startTime: occurrences[i].start,
            endTime: occurrences[i].end,
            manageToken: tokens[i],
            answers: answersJson,
            guests: guestsJson,
            status,
            seriesId,
            seriesIndex: i + 1,
            seriesTotal: occurrences.length,
          },
        });
        ids.push(created.id);
      }
      return ids;
    });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("SLOT_TAKEN:")) {
      const iso = err.message.slice("SLOT_TAKEN:".length);
      return {
        ok: false,
        error: `${dateFmt(new Date(iso))} is no longer available — the series wasn't booked.`,
      };
    }
    throw err;
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const firstManageUrl = `${baseUrl}/booking/${tokens[0]}`;
  const whenList = occurrences.map((o) => formatWhen(o.start, viewerTz));

  // Pending series: skip meeting links + full confirmation; notify both parties.
  if (eventType.requiresApproval) {
    try {
      const dates = whenList.map((w) => `• ${w}`).join("\n");
      const inviteeEmail = await renderTemplate("booking.pending.invitee", {
        invitee_name: name,
        business_name: eventType.user.businessName,
        event_title: `${eventType.title} (weekly × ${occurrences.length})`,
        when: whenList[0],
        timezone: viewerTz,
      });
      await sendEmail({
        to: email,
        ...inviteeEmail,
        text: `${inviteeEmail.text}\n\nAll sessions:\n${dates}`,
        ...(eventType.replyToEmail ? { replyTo: eventType.replyToEmail } : {}),
      });
      const ownerEmail = await renderTemplate("booking.pending.owner", {
        invitee_name: name,
        invitee_email: email,
        event_title: `${eventType.title} (weekly × ${occurrences.length})`,
        when: formatWhen(occurrences[0].start, businessTz),
        timezone: businessTz,
        review_url: `${baseUrl}/dashboard/bookings`,
      });
      await sendEmail({ to: eventType.user.email, ...ownerEmail });
    } catch (err) {
      logger.error({ err, eventTypeId: eventType.id }, "Failed to send pending recurring email");
    }
    return {
      ok: true,
      when: whenList[0],
      manageUrl: firstManageUrl,
      pending: true,
      series: { total: occurrences.length, whenList },
    };
  }

  // Provision a video meeting PER occurrence (each is an independent event) and
  // build one ICS per occurrence. Best-effort — never fails the booking.
  const icsAttachments: { filename: string; content: string; contentType: string }[] = [];
  for (let i = 0; i < occurrences.length; i++) {
    const o = occurrences[i];
    const manageUrl = `${baseUrl}/booking/${tokens[i]}`;
    let meetingUrl: string | null = null;
    let locationText: string | null = null;
    if (eventType.locationType === "GOOGLE_MEET") {
      const meet = await createMeetEvent({
        userId: eventType.userId,
        summary: `${eventType.title} — ${name}`,
        description: `Booking with ${eventType.user.businessName} (${i + 1}/${occurrences.length}). Manage: ${manageUrl}`,
        startUtc: o.start,
        endUtc: o.end,
        timeZone: businessTz,
        attendees: [
          { email, name },
          { email: eventType.user.email, name: eventType.user.businessName },
          ...guests.map((g) => ({ email: g.email, name: g.name })),
        ],
      });
      if (meet) {
        meetingUrl = meet.meetingUrl;
        locationText = meet.meetingUrl;
        await prisma.booking.update({
          where: { id: createdIds[i] },
          data: { meetingUrl: meet.meetingUrl, calendarEventId: meet.calendarEventId, meetingProvider: "google" },
        });
      }
    } else if (eventType.locationType === "ZOOM") {
      const meet = await createZoomMeeting({
        userId: eventType.userId,
        topic: `${eventType.title} — ${name}`,
        startUtc: o.start,
        endUtc: o.end,
        timeZone: businessTz,
      });
      if (meet) {
        meetingUrl = meet.meetingUrl;
        locationText = meet.meetingUrl;
        await prisma.booking.update({
          where: { id: createdIds[i] },
          data: { meetingUrl: meet.meetingUrl, calendarEventId: meet.meetingId, meetingProvider: "zoom" },
        });
      }
    } else if (eventType.locationDetail) {
      locationText = eventType.locationDetail;
    }

    const ics = buildIcs({
      uid: tokens[i],
      sequence: 0,
      method: "REQUEST",
      start: o.start,
      end: o.end,
      title: `${eventType.title} — ${eventType.user.businessName}`,
      description: `Booking with ${eventType.user.businessName} (${i + 1}/${occurrences.length}).${meetingUrl ? ` Join: ${meetingUrl}.` : ""} Manage: ${manageUrl}`,
      organizerName: eventType.user.businessName,
      organizerEmail: eventType.user.email,
      attendeeName: name,
      attendeeEmail: email,
      extraAttendees: guests,
      location: locationText,
    });
    icsAttachments.push({
      filename: `invite-${i + 1}.ics`,
      content: ics,
      contentType: "text/calendar; charset=utf-8; method=REQUEST",
    });
  }

  // One confirmation email carrying ALL occurrence invites (avoids sending N
  // separate emails and burning send quota).
  try {
    const dates = whenList.map((w) => `• ${w}`).join("\n");
    const inviteeEmail = await renderTemplate("booking.confirmed.invitee", {
      invitee_name: name,
      business_name: eventType.user.businessName,
      event_title: `${eventType.title} (weekly × ${occurrences.length})`,
      when: whenList[0],
      timezone: viewerTz,
      with_line: `\nAll sessions:\n${dates}`,
      manage_url: firstManageUrl,
    });
    await sendEmail({
      to: email,
      ...inviteeEmail,
      attachments: icsAttachments,
      ...(eventType.replyToEmail ? { replyTo: eventType.replyToEmail } : {}),
    });
    for (const guest of guests) {
      await sendEmail({
        to: guest.email,
        ...inviteeEmail,
        attachments: icsAttachments,
        ...(eventType.replyToEmail ? { replyTo: eventType.replyToEmail } : {}),
      });
    }
    const ownerEmail = await renderTemplate("booking.created.owner", {
      invitee_name: name,
      invitee_email: email,
      event_title: `${eventType.title} (weekly × ${occurrences.length})`,
      when: formatWhen(occurrences[0].start, businessTz),
      timezone: businessTz,
      extra: `\nAll sessions:\n${dates}${input.notes ? `\nNotes: ${input.notes}` : ""}`,
    });
    await sendEmail({ to: eventType.user.email, ...ownerEmail, attachments: icsAttachments });
  } catch (err) {
    logger.error({ err, eventTypeId: eventType.id }, "Failed to send recurring booking email");
  }

  return {
    ok: true,
    when: whenList[0],
    manageUrl: firstManageUrl,
    redirectUrl: eventType.confirmationRedirectUrl,
    series: { total: occurrences.length, whenList },
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
    logger.error({ err, eventTypeId: eventType.id }, "Failed to send group booking email");
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
