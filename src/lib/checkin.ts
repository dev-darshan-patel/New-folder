import "server-only";
import { prisma } from "@/lib/prisma";

// A ticket code is `tkt-` followed by a UUID (see createGroupBookingAction:
// `tkt-${crypto.randomUUID()}`). The QR encodes the full ticket URL, so at
// scan time we might receive the whole URL, the raw code, or something in
// between depending on the scanner. Extract just the code — tolerantly.
//
// Kept in its own function so it can be unit-tested without a database.
const CODE_RE = /tkt-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
export function extractTicketCode(input: string): string | null {
  if (!input) return null;
  const match = input.trim().toLowerCase().match(CODE_RE);
  return match ? match[0] : null;
}

// Discriminated result — the scanner UI renders three visually distinct
// outcomes, and the code inside each branch depends on things the others
// don't have (e.g. `checkedInAt` only exists on ALREADY_USED). A union type
// is what forces the UI to handle each case explicitly.
export type CheckInResult =
  | {
      status: "OK";
      ticket: { serial: number; attendeeName: string | null };
      checkedIn: number;
      capacity: number | null;
    }
  | {
      status: "ALREADY_USED";
      ticket: { serial: number; attendeeName: string | null };
      checkedInAt: Date;
      checkedIn: number;
      capacity: number | null;
    }
  | { status: "VOID"; ticket: { serial: number; attendeeName: string | null } }
  | { status: "WRONG_EVENT"; expectedSessionId: string; actualSessionId: string | null }
  | { status: "NOT_FOUND"; rawInput: string };

// Atomically mark a ticket as checked in, ensuring the same ticket can never
// be admitted twice — even if two staff members scan simultaneously.
//
// The whole point of doing this as `updateMany ... WHERE status = 'ISSUED'`
// (rather than read + update) is that the database itself refuses the second
// scan. Postgres serialises the two UPDATEs on the row lock, the first flips
// ISSUED → CHECKED_IN, and the second's WHERE no longer matches, returning
// count 0. Application-level "check first then update" would race.
//
// The session guard belongs to the caller: it prevents Staff at Event A from
// admitting a ticket that belongs to Event B (they're at the wrong door).
export async function checkInTicket(
  sessionId: string,
  rawInput: string,
): Promise<CheckInResult> {
  const code = extractTicketCode(rawInput);
  if (!code) return { status: "NOT_FOUND", rawInput };

  // The atomic transition: only ISSUED can become CHECKED_IN. Second scans
  // (already CHECKED_IN) and voided tickets (Phase 3, refunds) both match
  // zero rows and fall through to the diagnostic query below.
  const now = new Date();
  const flipped = await prisma.ticket.updateMany({
    where: { code, sessionId, status: "ISSUED" },
    data: { status: "CHECKED_IN", checkedInAt: now },
  });

  // Fresh counts + ticket details for the UI, regardless of outcome. Cheap
  // enough (single indexed queries) to always fetch — keeps the caller
  // simple and avoids a stale count on the success path.
  const ticket = await prisma.ticket.findUnique({
    where: { code },
    select: {
      serial: true,
      attendeeName: true,
      status: true,
      checkedInAt: true,
      sessionId: true,
    },
  });

  if (!ticket) return { status: "NOT_FOUND", rawInput };

  // Wrong door: the ticket exists but belongs to a different session. Report
  // it distinctly from NOT_FOUND so the scanner UI can show a clearer error
  // ("this ticket is for a different session") rather than "no such ticket".
  if (ticket.sessionId !== sessionId) {
    return {
      status: "WRONG_EVENT",
      expectedSessionId: sessionId,
      actualSessionId: ticket.sessionId,
    };
  }

  if (flipped.count === 1) {
    const counts = await countsForSession(sessionId);
    return {
      status: "OK",
      ticket: { serial: ticket.serial, attendeeName: ticket.attendeeName },
      ...counts,
    };
  }

  if (ticket.status === "CHECKED_IN" && ticket.checkedInAt) {
    const counts = await countsForSession(sessionId);
    return {
      status: "ALREADY_USED",
      ticket: { serial: ticket.serial, attendeeName: ticket.attendeeName },
      checkedInAt: ticket.checkedInAt,
      ...counts,
    };
  }

  // Refunded or otherwise invalidated. The status guard already prevents
  // admission — this branch just names the reason for the UI.
  return {
    status: "VOID",
    ticket: { serial: ticket.serial, attendeeName: ticket.attendeeName },
  };
}

async function countsForSession(sessionId: string) {
  const [checkedIn, session] = await Promise.all([
    prisma.ticket.count({ where: { sessionId, status: "CHECKED_IN" } }),
    prisma.session.findUnique({
      where: { id: sessionId },
      select: { capacity: true, unlimited: true },
    }),
  ]);
  return {
    checkedIn,
    capacity: session && !session.unlimited ? session.capacity : null,
  };
}
