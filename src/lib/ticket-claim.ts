import "server-only";
import { Prisma } from "@prisma/client";

// The atomic seat claim for ticketed sessions — the single most
// safety-critical operation in ticketing, and now the only copy of it.
//
// Every variant is one `UPDATE ... WHERE <capacity check>`: the database
// evaluates availability as part of the write and takes the row lock, so two
// racing orders for the last seat can't both succeed. A read-then-write would
// race no matter how the surrounding code is arranged.
//
// This started as a four-way branch inline in createGroupBookingAction
// (tiered/untiered × paid/free). Manual desk registration needed the same
// guarantees, and a second copy of a concurrency primitive is how the two
// silently drift apart, so it lives here instead.

export class SessionUnavailableError extends Error {
  constructor() {
    super("SESSION_UNAVAILABLE");
    this.name = "SessionUnavailableError";
  }
}

export type ClaimOptions = {
  sessionId: string;
  eventTypeId: string;
  // Which ticket category to claim against. When set, THE TIER's own capacity
  // is what bounds the claim — not Session.capacity — because that's the whole
  // point of categories (see the TicketTier schema comment).
  tierId: string | null;
  qty: number;
  // Whether to advance Session.ticketsIssued and hand back a serial range.
  // False for a paid order, where the real Ticket rows (and therefore their
  // serial numbers) aren't created until the payment webhook confirms — so an
  // abandoned checkout never burns a number nobody received.
  allocateSerials: boolean;
  // Normally a claim requires the session to still be in the future. Manual
  // registration at the door deliberately passes false: a race-kit desk on
  // event morning, or a late walk-in after the gun has gone, is exactly when
  // an organiser needs to add someone.
  requireFutureStart?: boolean;
};

// Returns the value of Session.ticketsIssued AFTER this claim; the serials for
// this order are `serialHigh - qty + 1 .. serialHigh`. Zero when
// allocateSerials is false.
export async function claimTicketSeats(
  tx: Prisma.TransactionClient,
  opts: ClaimOptions,
): Promise<{ serialHigh: number }> {
  const { sessionId, eventTypeId, tierId, qty, allocateSerials } = opts;
  const requireFutureStart = opts.requireFutureStart ?? true;

  if (qty < 1) throw new SessionUnavailableError();

  if (tierId) {
    // Capacity-gated claim on the category itself. NULL capacity = unlimited
    // within that category.
    const tierRows = await tx.$queryRaw<{ seatsTaken: number }[]>`
      UPDATE "TicketTier"
      SET "seatsTaken" = "seatsTaken" + ${qty}
      WHERE id = ${tierId}
        AND "sessionId" = ${sessionId}
        AND (capacity IS NULL OR "seatsTaken" + ${qty} <= capacity)
      RETURNING "seatsTaken"
    `;
    if (tierRows.length === 0) throw new SessionUnavailableError();
  }

  // The session's aggregate counters. When a tier already gated the claim we
  // deliberately DON'T re-check Session.capacity here — the tier is the
  // authority — but the session must still exist, be live, and (usually) not
  // have started. If this second statement matches zero rows the whole
  // transaction rolls back, tier claim included, so seats can never leak.
  const capacityGuard = tierId
    ? Prisma.empty
    : Prisma.sql`AND (unlimited OR "seatsTaken" + ${qty} <= capacity)`;
  const startGuard = requireFutureStart ? Prisma.sql`AND "startTime" > NOW()` : Prisma.empty;
  const serialBump = allocateSerials
    ? Prisma.sql`, "ticketsIssued" = "ticketsIssued" + ${qty}`
    : Prisma.empty;

  const rows = await tx.$queryRaw<{ ticketsIssued: number }[]>`
    UPDATE "Session"
    SET "seatsTaken" = "seatsTaken" + ${qty}${serialBump},
        "updatedAt" = NOW()
    WHERE id = ${sessionId}
      AND "eventTypeId" = ${eventTypeId}
      AND cancelled = false
      ${startGuard}
      ${capacityGuard}
    RETURNING "ticketsIssued"
  `;
  if (rows.length === 0) throw new SessionUnavailableError();

  return { serialHigh: allocateSerials ? Number(rows[0].ticketsIssued) : 0 };
}
