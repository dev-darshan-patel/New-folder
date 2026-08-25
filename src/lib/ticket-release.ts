import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

type Db = Prisma.TransactionClient | typeof prisma;

// Release `qty` reserved seats back into inventory — the inverse of the
// atomic claim in createGroupBookingAction. Used from three places that all
// need the same "give the seats back" step: a free-ticket cancel, a paid
// order's checkout hold expiring/failing, and a pre-event refund. Guarded by
// `> 0` floors so a double-release (a race, a retried cron tick) can never
// push a counter negative.
export async function releaseTicketedSeats(
  db: Db,
  { sessionId, tierId, qty }: { sessionId: string; tierId: string | null; qty: number },
): Promise<void> {
  if (qty <= 0) return;
  if (tierId) {
    await db.$executeRaw`
      UPDATE "TicketTier"
      SET "seatsTaken" = GREATEST("seatsTaken" - ${qty}, 0)
      WHERE id = ${tierId}
    `;
  }
  await db.$executeRaw`
    UPDATE "Session"
    SET "seatsTaken" = GREATEST("seatsTaken" - ${qty}, 0), "updatedAt" = NOW()
    WHERE id = ${sessionId}
  `;
}

export type VoidAndReleaseResult = { voided: number; released: boolean };

// Atomically void every still-ISSUED ticket on a booking and (optionally)
// release the seats they held, in one UPDATE ... RETURNING — which makes the
// whole operation naturally idempotent. That matters because this is called
// from two different places for the SAME cancellation: cancelBookingAction
// cancels the booking and releases its tickets directly, then separately
// calls refundBookingPayment() for the money side — which also needs to
// react to the ticket state. Since the first call already flipped every
// ticket to VOID, the second call's WHERE status = 'ISSUED' matches zero
// rows and does nothing. No double-release, no coordination needed between
// the two call sites.
//
// Deliberately does NOT touch a ticket that's already CHECKED_IN: once
// someone has been admitted, cancelling/refunding the order after the fact
// shouldn't retroactively invalidate their entry.
//
// `releaseSeats: false` voids the tickets (blocks check-in at the gate)
// WITHOUT giving the seats back to inventory — used when refunding an order
// for a session that has already started or passed, where "available again"
// would be meaningless (nobody could claim it anyway — the atomic claim
// itself requires startTime > NOW() — but showing an inflated remaining
// count would still be a lie).
export async function voidAndReleaseBookingTickets(
  db: Db,
  bookingId: string,
  options: { releaseSeats: boolean } = { releaseSeats: true },
): Promise<VoidAndReleaseResult> {
  const voided = await db.$queryRaw<
    { id: string; sessionId: string | null; tierId: string | null }[]
  >`
    UPDATE "Ticket"
    SET status = 'VOID', "updatedAt" = NOW()
    WHERE "bookingId" = ${bookingId} AND status = 'ISSUED'
    RETURNING id, "sessionId", "tierId"
  `;
  if (voided.length === 0) return { voided: 0, released: false };

  if (options.releaseSeats) {
    // Every ticket in one order shares the same session + tier — one buyer
    // picks a single category per checkout — so the first row speaks for all.
    const { sessionId, tierId } = voided[0];
    if (sessionId) {
      await releaseTicketedSeats(db, { sessionId, tierId, qty: voided.length });
    }
  }
  return { voided: voided.length, released: options.releaseSeats };
}
