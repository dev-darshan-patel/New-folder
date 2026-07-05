// A booking in either of these statuses occupies its slot — CONFIRMED
// obviously, and PENDING because it's awaiting owner approval and shouldn't
// be double-booked out from under the invitee while they wait.
import type { BookingStatus } from "@prisma/client";

export const BLOCKING_STATUSES: BookingStatus[] = ["CONFIRMED", "PENDING"];
