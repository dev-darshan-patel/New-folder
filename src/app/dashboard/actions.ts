"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { slugify } from "@/lib/slug";
import { getPlanConfig } from "@/lib/plans";
import type { FeatureKey } from "@/lib/features";
import { FONTS } from "@/lib/branding";
import { parseQuestions } from "@/lib/intake";
import { parseGuests } from "@/lib/guests";
import { sendEmail } from "@/lib/email";
import { renderTemplate } from "@/lib/email-templates";
import { buildIcs } from "@/lib/ics";
import { formatWhen } from "@/lib/format";
import { rateLimit } from "@/lib/rate-limit";
import { createMeetEvent, deleteMeetEvent } from "@/lib/google-calendar";
import { createZoomMeeting, deleteZoomMeeting } from "@/lib/zoom";
import { pricingEligibility } from "@/lib/payments";
import logger from "@/lib/logger";

// Re-send the email-verification link to the signed-in (unverified) user.
export async function resendVerificationAction(): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not authenticated" };
  if (user.emailVerifiedAt) return { ok: true };
  if (!(await rateLimit(`verify-resend:${user.id}`, 3, 3_600_000))) {
    return { ok: false, error: "Too many resends. Try again later." };
  }
  const token = crypto.randomUUID();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerifyToken: token,
      emailVerifyExpiresAt: new Date(Date.now() + 86_400_000),
    },
  });
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  try {
    const mail = await renderTemplate("auth.verify_email", {
      user_name: user.name,
      verify_url: `${base}/verify-email/${token}`,
    });
    await sendEmail({ to: user.email, ...mail });
  } catch (err) {
    logger.error({ err, userId: user.id }, "Failed to send verification email");
    return { ok: false, error: "Could not send the email. Try again later." };
  }
  return { ok: true };
}

// Save the full weekly availability for the current user.
// Expects, per weekday 0-6: enabled flag + start/end "HH:MM" values.
export async function saveAvailabilityAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  const rows: { weekday: number; startMinutes: number; endMinutes: number }[] = [];

  for (let weekday = 0; weekday < 7; weekday++) {
    if (formData.get(`enabled-${weekday}`) !== "on") continue;
    const start = toMinutes(String(formData.get(`start-${weekday}`) || ""));
    const end = toMinutes(String(formData.get(`end-${weekday}`) || ""));
    if (start === null || end === null || end <= start) continue;
    rows.push({ weekday, startMinutes: start, endMinutes: end });
  }

  await prisma.$transaction([
    prisma.availability.deleteMany({ where: { userId: user.id } }),
    prisma.availability.createMany({
      data: rows.map((r) => ({ ...r, userId: user.id })),
    }),
  ]);

  revalidatePath("/dashboard/availability");
}

// Add or replace a date override for one calendar date — "block this day
// entirely" or "use these hours instead of the weekly grid, just this once."
export async function saveDateOverrideAction(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  const date = String(formData.get("date") || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, error: "Please pick a valid date." };
  }
  const type = String(formData.get("type") || "");
  if (type !== "BLOCKED" && type !== "CUSTOM_HOURS") {
    return { ok: false, error: "Invalid override type." };
  }

  let startMinutes: number | null = null;
  let endMinutes: number | null = null;
  if (type === "CUSTOM_HOURS") {
    startMinutes = toMinutes(String(formData.get("startTime") || ""));
    endMinutes = toMinutes(String(formData.get("endTime") || ""));
    if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
      return { ok: false, error: "Please enter a valid start and end time." };
    }
  }

  await prisma.dateOverride.upsert({
    where: { userId_date: { userId: user.id, date } },
    create: { userId: user.id, date, type, startMinutes, endMinutes },
    update: { type, startMinutes, endMinutes },
  });

  revalidatePath("/dashboard/availability");
  return { ok: true };
}

export async function deleteDateOverrideAction(id: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  // Ownership re-checked in the where clause, same pattern as every other
  // dashboard mutation — one tenant can never touch another's rows.
  await prisma.dateOverride.deleteMany({ where: { id, userId: user.id } });
  revalidatePath("/dashboard/availability");
}

export async function createEventTypeAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  const title = String(formData.get("title") || "").trim();
  const duration = Number(formData.get("durationMinutes") || 30);
  const description = String(formData.get("description") || "").trim() || null;
  if (!title) return;

  // Enforce the plan's event-type limit.
  const limit = (await getPlanConfig(user.plan)).maxEventTypes;
  if (limit !== null) {
    const count = await prisma.eventType.count({ where: { userId: user.id } });
    if (count >= limit) {
      redirect("/dashboard/event-types?limit=1");
    }
  }

  // Build a slug unique within this user's event types.
  const root = slugify(title) || "meeting";
  let slug = root;
  let n = 1;
  while (
    await prisma.eventType.findUnique({
      where: { userId_slug: { userId: user.id, slug } },
    })
  ) {
    n += 1;
    slug = `${root}-${n}`;
  }

  await prisma.eventType.create({
    data: {
      userId: user.id,
      title,
      slug,
      description,
      durationMinutes: Number.isFinite(duration) ? duration : 30,
    },
  });

  revalidatePath("/dashboard/event-types");
}

// Save booking-page branding. Values persist on any plan but only render on
// plans that grant the custom_branding feature (enforced in resolveBranding).
export async function updateBrandingAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  const rawColor = String(formData.get("brandColor") || "").trim();
  const color = /^#[0-9a-fA-F]{6}$/.test(rawColor) ? rawColor : undefined;
  const font = String(formData.get("brandFont") || "").trim();
  const logoUrl = String(formData.get("logoUrl") || "").trim() || null;
  const welcomeMessage =
    String(formData.get("welcomeMessage") || "").trim().slice(0, 280) || null;

  await prisma.user.update({
    where: { id: user.id },
    data: {
      ...(color ? { brandColor: color } : {}),
      ...(font && FONTS[font] ? { brandFont: font } : {}),
      logoUrl,
      welcomeMessage,
    },
  });

  revalidatePath("/dashboard/branding");
}

export async function deleteEventTypeAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  const id = String(formData.get("id") || "");
  await prisma.eventType.deleteMany({ where: { id, userId: user.id } });
  revalidatePath("/dashboard/event-types");
}

// Update an event type's scheduling settings + intake questions.
export async function updateEventTypeAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  // Fetched once and reused for every gate below — plan checks are per-request
  // cached anyway, but this keeps the whole action to a single lookup.
  const planCfg = await getPlanConfig(user.plan);
  const has = (key: FeatureKey) => planCfg.featureKeys.includes(key);

  const id = String(formData.get("id") || "");

  // A downgrade must never destroy data — it only blocks *creating new*
  // gated usage. So every gated field below falls back to this row's current
  // value (not a hardcoded default) whenever the plan no longer grants it,
  // leaving settings from a higher plan intact until the owner is re-entitled
  // or explicitly changes them (which still requires the gate to be open).
  const existing = await prisma.eventType.findFirst({ where: { id, userId: user.id } });
  if (!existing) return;

  const title = String(formData.get("title") || "").trim();
  const description = String(formData.get("description") || "").trim() || null;
  const duration = clampInt(formData.get("durationMinutes"), 5, 1440, 30);

  // Scheduling limits (min notice + daily/weekly/monthly caps + cancel-notice
  // window) are a single gated bundle — ungated tenants keep whatever was
  // already saved; only an entitled tenant's form input can change it.
  const schedulingLimitsAllowed = has("scheduling_limits");
  const bufferMinutes = schedulingLimitsAllowed
    ? clampInt(formData.get("bufferMinutes"), 0, 100000, 0)
    : existing.bufferMinutes;
  const rawMax = String(formData.get("maxPerDay") || "").trim();
  const maxPerDay = !schedulingLimitsAllowed
    ? existing.maxPerDay
    : rawMax === ""
      ? null
      : clampInt(rawMax, 1, 1000, 1);
  const rawMaxWeek = String(formData.get("maxPerWeek") || "").trim();
  const maxPerWeek = !schedulingLimitsAllowed
    ? existing.maxPerWeek
    : rawMaxWeek === ""
      ? null
      : clampInt(rawMaxWeek, 1, 5000, 1);
  const rawMaxMonth = String(formData.get("maxPerMonth") || "").trim();
  const maxPerMonth = !schedulingLimitsAllowed
    ? existing.maxPerMonth
    : rawMaxMonth === ""
      ? null
      : clampInt(rawMaxMonth, 1, 20000, 1);
  const minNoticeToCancelMinutes = schedulingLimitsAllowed
    ? clampInt(formData.get("minNoticeToCancelMinutes"), 0, 100000, 0)
    : existing.minNoticeToCancelMinutes;

  // Confirmation redirect + reply-to are a single gated bundle. Redirect must
  // also be an absolute http(s) URL, or it's silently dropped regardless of
  // plan, rather than sending invitees to a broken/unsafe destination.
  const redirectReplyToAllowed = has("redirect_replyto");
  let confirmationRedirectUrl: string | null = existing.confirmationRedirectUrl;
  let replyToEmail: string | null = existing.replyToEmail;
  if (redirectReplyToAllowed) {
    const rawRedirect = String(formData.get("confirmationRedirectUrl") || "").trim();
    confirmationRedirectUrl = null;
    if (rawRedirect) {
      try {
        const parsed = new URL(rawRedirect);
        if (parsed.protocol === "http:" || parsed.protocol === "https:") {
          confirmationRedirectUrl = parsed.toString();
        }
      } catch {
        // invalid URL — leave as null
      }
    }

    const rawReplyTo = String(formData.get("replyToEmail") || "").trim();
    replyToEmail =
      rawReplyTo && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(rawReplyTo) ? rawReplyTo : null;
  }

  const requiresApproval = has("approval_flow")
    ? formData.get("requiresApproval") === "1"
    : existing.requiresApproval;

  // Group event type toggle. Any positive integer marks the event type as
  // GROUP (invitees book into owner-created Session rows); empty/zero = classic
  // 1:1 (unchanged behavior). Gated — ungated tenants keep whatever capacity
  // (or lack of one) the event type already had.
  const capacity = has("group_bookings")
    ? (() => {
        const raw = String(formData.get("capacity") || "").trim();
        return raw === "" ? null : clampInt(raw, 1, 10_000, 1);
      })()
    : existing.capacity;

  // Recurring toggle. Mutually exclusive with group — force off when this is a
  // group event type, regardless of what the form sent. Also gated: an
  // ungated tenant keeps the existing flag (still subject to the group
  // exclusion, since that's an invariant, not an entitlement).
  const allowRecurring =
    capacity != null
      ? false
      : has("recurring_bookings")
        ? formData.get("allowRecurring") === "1"
        : existing.allowRecurring;

  // Price (Feature 4.4). null = free (unchanged behavior). A paid price is
  // only accepted when the plan grants "payments", the owner is APPROVED +
  // onboarded on their active provider, AND the event type stays inside the
  // v1 scope fence (SOLO, non-group, non-recurring). Anything else keeps
  // whatever price already existed rather than wiping it — a downgrade or a
  // forged form field can block *setting a new* price but never silently
  // un-prices an event type that was already charging.
  let priceCents: number | null = existing.priceCents;
  let currency: string | null = existing.currency;
  if (has("payments")) {
    const rawPrice = String(formData.get("priceCents") || "").trim();
    let parsedPrice: number | null = null;
    if (rawPrice !== "") {
      const parsed = Number(rawPrice);
      if (Number.isFinite(parsed) && parsed > 0 && parsed <= 10_000_000) {
        parsedPrice = Math.round(parsed);
      }
    }
    const rawAssignment = String(formData.get("assignmentMode") || "SOLO");
    const scopeFenceOk =
      capacity == null && !allowRecurring && (rawAssignment === "SOLO" || rawAssignment === "");
    if (parsedPrice !== null && scopeFenceOk) {
      const eligibility = pricingEligibility({
        paymentAccountStatus: user.paymentAccountStatus,
        activePaymentProvider: user.activePaymentProvider,
        country: user.country,
        stripeConnectReady: user.stripeConnectReady,
        razorpayConnectReady: user.razorpayConnectReady,
      });
      if (eligibility.canPrice) {
        priceCents = parsedPrice;
        currency = eligibility.currency;
      }
    }
    // A blank price field on an entitled, scope-fenced save means the owner
    // explicitly cleared it — honor that.
    if (parsedPrice === null && rawPrice === "" && scopeFenceOk) {
      priceCents = null;
      currency = null;
    }
  }

  // Meeting location. GOOGLE_MEET/ZOOM only stick if the plan grants
  // video_links AND the owner has actually connected that provider;
  // otherwise fall back to whatever the event type already had (or
  // IN_PERSON if it's newly being pointed at a video location it can't use).
  let locationType: "IN_PERSON" | "PHONE" | "GOOGLE_MEET" | "ZOOM" = existing.locationType as
    | "IN_PERSON"
    | "PHONE"
    | "GOOGLE_MEET"
    | "ZOOM";
  let locationDetail = existing.locationDetail;
  if (has("video_links")) {
    const rawLocation = String(formData.get("locationType") || "IN_PERSON");
    locationType =
      rawLocation === "PHONE" || rawLocation === "GOOGLE_MEET" || rawLocation === "ZOOM"
        ? rawLocation
        : "IN_PERSON";
    if (locationType === "GOOGLE_MEET" || locationType === "ZOOM") {
      const provider = locationType === "GOOGLE_MEET" ? "google" : "zoom";
      const hasConnection = await prisma.calendarConnection.findUnique({
        where: { userId_provider: { userId: user.id, provider } },
        select: { id: true },
      });
      if (!hasConnection) locationType = "IN_PERSON";
    }
    locationDetail =
      locationType === "GOOGLE_MEET" || locationType === "ZOOM"
        ? null
        : String(formData.get("locationDetail") || "").trim().slice(0, 500) || null;
  }

  // Intake questions arrive as a JSON string from the client editor.
  const intakeQuestions = has("intake_questions")
    ? (() => {
        const questions = parseQuestions(String(formData.get("intakeQuestions") || "")).filter(
          (q) => q.label.trim() !== "",
        );
        return questions.length ? JSON.stringify(questions) : null;
      })()
    : existing.intakeQuestions;

  const teamSchedulingEnabled = has("team_scheduling");
  const assignmentMode: "SOLO" | "ROUND_ROBIN" | "COLLECTIVE" = teamSchedulingEnabled
    ? (() => {
        const rawMode = String(formData.get("assignmentMode") || "SOLO");
        return rawMode === "ROUND_ROBIN" || rawMode === "COLLECTIVE" ? rawMode : "SOLO";
      })()
    : (existing.assignmentMode as "SOLO" | "ROUND_ROBIN" | "COLLECTIVE");
  // Only touch the team pool when the plan actually grants team scheduling —
  // otherwise leave existing EventTypeMember rows alone rather than wiping
  // them because a downgraded tenant's form never submitted poolMemberIds.
  let poolMemberIds: string[] | null = null;
  if (teamSchedulingEnabled && assignmentMode !== "SOLO") {
    poolMemberIds = [];
    try {
      const raw = JSON.parse(String(formData.get("poolMemberIds") || "[]"));
      if (Array.isArray(raw)) poolMemberIds = raw.filter((x) => typeof x === "string");
    } catch {
      poolMemberIds = [];
    }
  }

  await prisma.eventType.update({
    where: { id: existing.id },
    data: {
      ...(title ? { title } : {}),
      description,
      durationMinutes: duration,
      bufferMinutes,
      maxPerDay,
      maxPerWeek,
      maxPerMonth,
      minNoticeToCancelMinutes,
      confirmationRedirectUrl,
      replyToEmail,
      requiresApproval,
      capacity,
      allowRecurring,
      intakeQuestions,
      assignmentMode,
      locationType,
      locationDetail,
      priceCents,
      currency,
    },
  });

  if (assignmentMode !== "SOLO" && !teamSchedulingEnabled) {
    // Preserve the existing pool untouched — see poolMemberIds comment above.
  } else if (assignmentMode !== "SOLO") {
    const validIds = poolMemberIds?.length
      ? (
          await prisma.teamMember.findMany({
            where: { id: { in: poolMemberIds }, userId: user.id },
            select: { id: true },
          })
        ).map((m) => m.id)
      : [];
    await prisma.$transaction([
      prisma.eventTypeMember.deleteMany({ where: { eventTypeId: id } }),
      prisma.eventTypeMember.createMany({
        data: validIds.map((teamMemberId) => ({ eventTypeId: id, teamMemberId })),
      }),
    ]);
  } else {
    await prisma.eventTypeMember.deleteMany({ where: { eventTypeId: id } });
  }

  revalidatePath("/dashboard/event-types");
  redirect("/dashboard/event-types");
}

function clampInt(
  value: FormDataEntryValue | null | string,
  min: number,
  max: number,
  fallback: number,
): number {
  const n = Number(String(value ?? ""));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function toMinutes(hhmm: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

// Create a Session for a GROUP event type. Owner picks a date/time + capacity;
// the system snapshots the event type's duration and (for GOOGLE_MEET/ZOOM
// event types) provisions ONE shared video meeting that every attendee will
// join. Ownership enforced by the userId filter on the event type lookup.
export async function createSessionAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  const eventTypeId = String(formData.get("eventTypeId") || "");
  const startLocal = String(formData.get("startLocal") || ""); // "YYYY-MM-DDTHH:mm"
  const rawCapacity = String(formData.get("capacity") || "").trim();

  const eventType = await prisma.eventType.findFirst({
    where: { id: eventTypeId, userId: user.id },
  });
  if (!eventType) return;
  if (eventType.capacity == null) return; // not a group event type

  const capacity = clampInt(rawCapacity || String(eventType.capacity), 1, 10_000, eventType.capacity);

  // Parse the local wall-clock string in the business timezone. `new Date(iso)`
  // interprets a bare "YYYY-MM-DDTHH:mm" as LOCAL to the server, which is wrong;
  // instead reconstruct it via TZDate so it's local to the business's own zone.
  const { TZDate } = await import("@date-fns/tz");
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(startLocal);
  if (!match) return;
  const [, y, mo, d, h, mi] = match.map(Number);
  const start = new Date(new TZDate(y, mo - 1, d, h, mi, 0, 0, user.timezone).getTime());
  if (Number.isNaN(start.getTime()) || start.getTime() < Date.now()) return;
  const end = new Date(start.getTime() + eventType.durationMinutes * 60_000);

  // Provision a shared meeting for Meet/Zoom event types up front, so every
  // booking that lands on this session inherits the same join URL. Failure
  // here is non-fatal — the session still exists, just without a link.
  let meetingUrl: string | null = null;
  let meetingProvider: string | null = null;
  let calendarEventId: string | null = null;
  if (eventType.locationType === "GOOGLE_MEET") {
    const meet = await createMeetEvent({
      userId: user.id,
      summary: `${eventType.title} (session)`,
      description: `Group session for ${eventType.title}.`,
      startUtc: start,
      endUtc: end,
      timeZone: user.timezone,
      attendees: [{ email: user.email, name: user.businessName }],
    });
    if (meet) {
      meetingUrl = meet.meetingUrl;
      calendarEventId = meet.calendarEventId;
      meetingProvider = "google";
    }
  } else if (eventType.locationType === "ZOOM") {
    const meet = await createZoomMeeting({
      userId: user.id,
      topic: `${eventType.title} (session)`,
      startUtc: start,
      endUtc: end,
      timeZone: user.timezone,
    });
    if (meet) {
      meetingUrl = meet.meetingUrl;
      calendarEventId = meet.meetingId;
      meetingProvider = "zoom";
    }
  }

  await prisma.session.create({
    data: {
      eventTypeId: eventType.id,
      startTime: start,
      durationMinutes: eventType.durationMinutes,
      capacity,
      meetingUrl,
      meetingProvider,
      calendarEventId,
    },
  });

  revalidatePath(`/dashboard/event-types/${eventType.id}`);
}

// Cancel a Session and any active bookings under it. Also deletes the
// underlying provider meeting (Meet/Zoom) if one was created. Bookings inside
// the session flip to CANCELLED; individual invitees keep their manage token
// so they can see the "this session was canceled" state, and the Session row
// is retained (with `cancelled = true`) for audit — not hard-deleted, so
// bookings still have a foreign key target.
export async function cancelSessionAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  const sessionId = String(formData.get("sessionId") || "");

  const session = await prisma.session.findFirst({
    where: { id: sessionId, eventType: { userId: user.id } },
    include: { eventType: true },
  });
  if (!session) return;
  if (session.cancelled) return;

  // Capture the active attendees BEFORE the transaction flips them to
  // CANCELLED, so we can notify each one that their session was called off.
  const attendees = await prisma.booking.findMany({
    where: { sessionId: session.id, status: { in: ["CONFIRMED", "PENDING"] } },
    select: {
      inviteeName: true,
      inviteeEmail: true,
      manageToken: true,
      sequence: true,
      guests: true,
    },
  });

  // Best-effort clean-up of the provider meeting.
  if (session.calendarEventId) {
    if (session.meetingProvider === "zoom") {
      await deleteZoomMeeting(user.id, session.calendarEventId);
    } else if (session.meetingProvider === "google") {
      await deleteMeetEvent(user.id, session.calendarEventId);
    }
  }

  await prisma.$transaction([
    prisma.booking.updateMany({
      where: { sessionId: session.id, status: { in: ["CONFIRMED", "PENDING"] } },
      data: { status: "CANCELLED" },
    }),
    prisma.session.update({
      where: { id: session.id },
      data: { cancelled: true, seatsTaken: 0 },
    }),
  ]);

  // Notify every attendee their session was canceled, with an ICS CANCEL so it
  // drops off their calendar. Best-effort — a send failure never blocks the
  // cancel. Reuses the generic booking-canceled template.
  const when = formatWhen(session.startTime, user.timezone);
  const end = new Date(session.startTime.getTime() + session.durationMinutes * 60_000);
  for (const a of attendees) {
    const cancelIcs = {
      filename: "invite.ics",
      content: buildIcs({
        uid: a.manageToken ?? `${session.id}-${a.inviteeEmail}`,
        sequence: a.sequence + 1,
        method: "CANCEL" as const,
        start: session.startTime,
        end,
        title: `${session.eventType.title} — ${user.businessName}`,
        organizerName: user.businessName,
        organizerEmail: user.email,
        attendeeName: a.inviteeName,
        attendeeEmail: a.inviteeEmail,
      }),
      contentType: "text/calendar; charset=utf-8; method=CANCEL",
    };
    try {
      const mail = await renderTemplate("booking.canceled.invitee", {
        invitee_name: a.inviteeName,
        business_name: user.businessName,
        event_title: session.eventType.title,
        when,
      });
      await sendEmail({
        to: a.inviteeEmail,
        ...mail,
        attachments: [cancelIcs],
        ...(session.eventType.replyToEmail ? { replyTo: session.eventType.replyToEmail } : {}),
      });
      // Guests the attendee added get the same notice.
      for (const g of parseGuests(a.guests)) {
        await sendEmail({
          to: g.email,
          ...mail,
          attachments: [cancelIcs],
          ...(session.eventType.replyToEmail ? { replyTo: session.eventType.replyToEmail } : {}),
        });
      }
    } catch (err) {
      logger.error({ err, sessionId: session.id }, "Failed to send session-cancellation email");
    }
  }

  revalidatePath(`/dashboard/event-types/${session.eventTypeId}`);
  revalidatePath("/dashboard/bookings");
}
