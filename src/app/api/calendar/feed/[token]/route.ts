import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildIcsFeed, type IcsFeedEvent } from "@/lib/ics";
import { BLOCKING_STATUSES } from "@/lib/booking-status";
import { rateLimit, clientIp } from "@/lib/rate-limit";

// Read-only iCal subscription feed. The tenant pastes this URL into Google /
// Apple / Outlook Calendar and their bookings appear automatically.
//
// Auth: the unguessable token in the path IS the credential — there is no
// session here, because calendar clients can't log in. Same pattern as the
// invitee's booking manage link. Regenerating the token (see
// regenerateCalendarFeedTokenAction) revokes every existing subscription.
//
// Optional ?eventType=<id> narrows the feed to a single event type, so an
// owner can subscribe to just one calendar if they prefer.

// How much history/future to include. Bounded so the payload stays small on
// busy accounts — calendar apps re-fetch this every hour or so.
const PAST_DAYS = 30;
const FUTURE_DAYS = 365;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  // Public URL — throttle by IP so a leaked token can't be used to hammer us.
  if (!(await rateLimit(`ical:${await clientIp()}`, 60, 60_000))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  if (!token || token.length < 16) {
    return new NextResponse("Not found", { status: 404 });
  }

  const user = await prisma.user.findUnique({
    where: { calendarFeedToken: token },
    select: {
      id: true,
      businessName: true,
      timezone: true,
      suspended: true,
      deletedAt: true,
    },
  });

  // Suspended/deleted accounts stop serving their feed, matching how their
  // public booking pages behave.
  if (!user || user.suspended || user.deletedAt) {
    return new NextResponse("Not found", { status: 404 });
  }

  const eventTypeId = req.nextUrl.searchParams.get("eventType");
  const now = Date.now();

  const bookings = await prisma.booking.findMany({
    where: {
      userId: user.id,
      status: { in: BLOCKING_STATUSES },
      startTime: {
        gte: new Date(now - PAST_DAYS * 86_400_000),
        lte: new Date(now + FUTURE_DAYS * 86_400_000),
      },
      ...(eventTypeId ? { eventTypeId } : {}),
    },
    orderBy: { startTime: "asc" },
    select: {
      id: true,
      manageToken: true,
      startTime: true,
      endTime: true,
      inviteeName: true,
      inviteeEmail: true,
      notes: true,
      status: true,
      meetingUrl: true,
      eventType: { select: { title: true, locationDetail: true } },
      teamMember: { select: { name: true } },
    },
  });

  const events: IcsFeedEvent[] = bookings.map((b) => ({
    // Stable UID so re-fetching updates the same entry instead of duplicating.
    // manageToken is the same UID the invitee's own invite uses.
    uid: b.manageToken ?? b.id,
    start: b.startTime,
    end: b.endTime,
    title: `${b.eventType.title} — ${b.inviteeName}`,
    description: [
      `${b.inviteeName} (${b.inviteeEmail})`,
      b.teamMember?.name ? `With: ${b.teamMember.name}` : "",
      b.meetingUrl ? `Join: ${b.meetingUrl}` : "",
      b.notes ? `Notes: ${b.notes}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    location: b.meetingUrl ?? b.eventType.locationDetail,
    // Not-yet-confirmed bookings show as tentative so the owner can tell them
    // apart at a glance in their calendar.
    tentative: b.status !== "CONFIRMED",
  }));

  const ics = buildIcsFeed({
    calendarName: eventTypeId
      ? `${user.businessName} — ${bookings[0]?.eventType.title ?? "Bookings"}`
      : `${user.businessName} — Bookings`,
    events,
  });

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="bookings.ics"',
      // Let clients cache briefly, but never let a shared/CDN cache hold a
      // token-scoped calendar.
      "Cache-Control": "private, max-age=300",
    },
  });
}
