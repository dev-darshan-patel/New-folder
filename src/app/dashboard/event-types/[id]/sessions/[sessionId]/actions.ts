"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { planHasFeature } from "@/lib/plans";
import { claimTicketSeats, SessionUnavailableError } from "@/lib/ticket-claim";
import { sendEmail } from "@/lib/email";
import { renderTemplate } from "@/lib/email-templates";
import { formatWhen } from "@/lib/format";
import logger from "@/lib/logger";

export type DeskResult = { ok: true; message?: string } | { ok: false; error: string };

// Shared ownership check: the session must belong to a ticketed event type
// this user owns. Every action in this file is a desk operation on someone
// else's paid-for event if this is wrong, so it's the first thing each does.
type OwnedSession = NonNullable<
  Awaited<ReturnType<typeof findOwnedSession>>
>;

function findOwnedSession(userId: string, sessionId: string) {
  return prisma.session.findFirst({
    where: { id: sessionId, eventType: { userId, issuesTickets: true } },
    include: { eventType: true, tiers: { orderBy: { sortOrder: "asc" } } },
  });
}

async function loadOwnedSession(
  sessionId: string,
): Promise<
  | { ok: true; user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>; session: OwnedSession }
  | { ok: false; error: string }
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not authenticated." };
  const session = await findOwnedSession(user.id, sessionId);
  if (!session) return { ok: false, error: "Session not found." };
  return { ok: true, user, session };
}

// Register a walk-in from the organiser's own desk (Phase 6). This is the
// cash-sale / race-kit-desk path: no payment flow, confirmed immediately, and
// the seats come out of the SAME atomic claim the public purchase path uses —
// a desk sale and an online sale race each other for the last seat exactly as
// they should.
export async function manualRegisterAction(input: {
  sessionId: string;
  name: string;
  email: string;
  quantity: number;
  tierId?: string | null;
  notify: boolean;
}): Promise<DeskResult> {
  const loaded = await loadOwnedSession(input.sessionId);
  if (!loaded.ok) return loaded;
  const { user, session } = loaded;

  if (!(await planHasFeature(user.plan, "manual_bookings"))) {
    return { ok: false, error: "Manual registration isn't available on your current plan." };
  }
  if (session.cancelled) return { ok: false, error: "This session was cancelled." };

  const name = input.name.trim().slice(0, 200);
  if (!name) return { ok: false, error: "Attendee name is required." };

  // Email is OPTIONAL here, unlike every public booking path: a cash walk-in
  // frequently has no email to give, and refusing to register them would make
  // the desk unusable. Stored as "" in that case, which every send path below
  // guards on — and which sendDueReminders() now filters out, so a
  // no-email booking can't make the reminder cron retry forever.
  const email = input.email.trim().toLowerCase().slice(0, 320);
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, error: "That email address doesn't look valid." };
  }
  if (input.notify && !email) {
    return { ok: false, error: "Add an email address, or turn off the ticket email." };
  }

  const qty = Math.floor(input.quantity);
  if (!Number.isFinite(qty) || qty < 1 || qty > 50) {
    return { ok: false, error: "Choose between 1 and 50 tickets." };
  }

  // A tier is required exactly when the session has any — same rule the public
  // widget follows, re-checked here because this action is directly callable.
  let tierId: string | null = null;
  if (session.tiers.length > 0) {
    const tier = session.tiers.find((t) => t.id === input.tierId);
    if (!tier) return { ok: false, error: "Choose a ticket category." };
    tierId = tier.id;
  }

  const manageToken = `booked-${crypto.randomUUID()}`;
  let ticketCodes: string[] = [];
  try {
    ticketCodes = await prisma.$transaction(async (tx) => {
      const { serialHigh } = await claimTicketSeats(tx, {
        sessionId: session.id,
        eventTypeId: session.eventTypeId,
        tierId,
        qty,
        allocateSerials: true,
        // The desk operates ON event day — often after the doors open, and a
        // late walk-in is precisely who this is for. The public path still
        // requires a future start.
        requireFutureStart: false,
      });

      const booking = await tx.booking.create({
        data: {
          userId: user.id,
          eventTypeId: session.eventTypeId,
          sessionId: session.id,
          inviteeName: name,
          inviteeEmail: email,
          startTime: session.startTime,
          endTime: new Date(session.startTime.getTime() + session.durationMinutes * 60_000),
          manageToken,
          status: "CONFIRMED",
          notes: "Registered at the door.",
        },
      });

      const rows = Array.from({ length: qty }, (_, i) => ({
        bookingId: booking.id,
        sessionId: session.id,
        tierId,
        code: `tkt-${crypto.randomUUID()}`,
        serial: serialHigh - qty + 1 + i,
        attendeeName: name,
      }));
      await tx.ticket.createMany({ data: rows });
      return rows.map((r) => r.code);
    });
  } catch (err) {
    if (err instanceof SessionUnavailableError) {
      return { ok: false, error: "No seats left in that category." };
    }
    throw err;
  }

  revalidatePath(`/dashboard/event-types/${session.eventTypeId}/sessions/${session.id}`);

  if (input.notify && email) {
    await sendTicketEmail({
      to: email,
      name,
      businessName: user.businessName,
      eventTitle: session.eventType.title,
      when: formatWhen(session.startTime, user.timezone),
      timezone: user.timezone,
      manageToken,
      codes: ticketCodes,
      replyTo: session.eventType.replyToEmail,
    });
  }

  return {
    ok: true,
    message: `Registered ${name} — ${qty} ticket${qty === 1 ? "" : "s"}${
      input.notify && email ? ", email sent" : ""
    }.`,
  };
}

// Change a ticket's printed number. Race bibs are frequently pre-printed and
// handed out non-sequentially, so the auto-assigned serial has to be
// correctable — but it stays unique within the session, which is what makes
// it usable as an identifier at the gate.
export async function updateTicketSerialAction(input: {
  ticketId: string;
  serial: number;
}): Promise<DeskResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  const ticket = await prisma.ticket.findFirst({
    where: { id: input.ticketId, booking: { userId: user.id } },
    select: { id: true, sessionId: true, booking: { select: { eventTypeId: true } } },
  });
  if (!ticket) return { ok: false, error: "Ticket not found." };

  const serial = Math.floor(input.serial);
  if (!Number.isFinite(serial) || serial < 1 || serial > 1_000_000) {
    return { ok: false, error: "Enter a number between 1 and 1,000,000." };
  }

  try {
    await prisma.ticket.update({ where: { id: ticket.id }, data: { serial } });
  } catch (err) {
    // @@unique([sessionId, serial]) — the DB is what guarantees uniqueness,
    // so a duplicate surfaces here rather than in a check-then-write that
    // two simultaneous edits could both pass.
    if (typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002") {
      return { ok: false, error: `Number ${serial} is already used in this event.` };
    }
    throw err;
  }

  if (ticket.sessionId) {
    revalidatePath(
      `/dashboard/event-types/${ticket.booking.eventTypeId}/sessions/${ticket.sessionId}`,
    );
  }
  return { ok: true, message: `Ticket number changed to #${serial}.` };
}

// Re-send the ticket links for one order — the "I lost the email" desk
// request. Sends the same content the original confirmation carried.
export async function resendTicketEmailAction(input: {
  bookingId: string;
}): Promise<DeskResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  const booking = await prisma.booking.findFirst({
    where: { id: input.bookingId, userId: user.id },
    include: { eventType: true, tickets: { orderBy: { serial: "asc" } } },
  });
  if (!booking) return { ok: false, error: "Booking not found." };
  if (!booking.inviteeEmail) {
    return { ok: false, error: "This attendee has no email address on file." };
  }
  if (booking.tickets.length === 0) {
    return { ok: false, error: "This booking has no tickets yet." };
  }

  const sent = await sendTicketEmail({
    to: booking.inviteeEmail,
    name: booking.inviteeName,
    businessName: user.businessName,
    eventTitle: booking.eventType.title,
    when: formatWhen(booking.startTime, user.timezone),
    timezone: user.timezone,
    manageToken: booking.manageToken ?? "",
    codes: booking.tickets.map((t) => t.code),
    replyTo: booking.eventType.replyToEmail,
  });
  if (!sent) return { ok: false, error: "Couldn't send the email. Check your email settings." };
  return { ok: true, message: `Tickets re-sent to ${booking.inviteeEmail}.` };
}

// One place that formats a ticket email, so the desk's "register" and "resend"
// produce identical mail rather than two near-copies.
async function sendTicketEmail(p: {
  to: string;
  name: string;
  businessName: string;
  eventTitle: string;
  when: string;
  timezone: string;
  manageToken: string;
  codes: string[];
  replyTo: string | null;
}): Promise<boolean> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const ticketLine =
    `\n\nYour ${p.codes.length === 1 ? "ticket" : `${p.codes.length} tickets`}:` +
    p.codes.map((c) => `\n${baseUrl}/ticket/${c}`).join("");
  try {
    const mail = await renderTemplate("booking.confirmed.invitee", {
      invitee_name: p.name,
      business_name: p.businessName,
      event_title: p.eventTitle,
      when: p.when,
      timezone: p.timezone,
      with_line: ticketLine,
      manage_url: `${baseUrl}/booking/${p.manageToken}`,
    });
    await sendEmail({ to: p.to, ...mail, ...(p.replyTo ? { replyTo: p.replyTo } : {}) });
    return true;
  } catch (err) {
    logger.error({ err, to: p.to }, "Failed to send ticket email");
    return false;
  }
}
