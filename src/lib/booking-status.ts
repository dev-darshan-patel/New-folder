// A booking in any of these statuses occupies its slot:
// - CONFIRMED: obviously.
// - PENDING: awaiting owner approval; shouldn't be double-booked out from
//   under the invitee while they wait.
// - PENDING_PAYMENT (Feature 4.5): customer is at the payment provider's
//   checkout. Slot is held for ~30 min until webhook confirms or the cron
//   expires the hold.
import type { BookingStatus } from "@prisma/client";

export const BLOCKING_STATUSES: BookingStatus[] = [
  "CONFIRMED",
  "PENDING",
  "PENDING_PAYMENT",
];
