import "server-only";
import { prisma } from "@/lib/prisma";

// Helpers for the read-only iCal subscription feed (/api/calendar/feed/{token}).
//
// These deliberately live outside src/app/dashboard/settings/actions.ts: that
// file is "use server", so every export there becomes a client-callable server
// action. A userId-taking helper exported from it would be an IDOR — any client
// could mint or read another tenant's feed token. Server components import
// from here directly instead.

function newFeedToken(): string {
  // Two UUIDs' worth of entropy — this token is the only credential guarding
  // the feed, and it travels in a URL that ends up pasted into calendar apps.
  return `cal-${crypto.randomUUID()}${crypto.randomUUID().replace(/-/g, "")}`;
}

// Return the account's feed token, creating one on first use. Idempotent, so
// the settings page can call it on every render.
export async function ensureCalendarFeedToken(userId: string): Promise<string> {
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { calendarFeedToken: true },
  });
  if (existing?.calendarFeedToken) return existing.calendarFeedToken;

  const token = newFeedToken();
  await prisma.user.update({
    where: { id: userId },
    data: { calendarFeedToken: token },
  });
  return token;
}

// Replace the token, invalidating every existing subscription.
export async function rotateCalendarFeedToken(userId: string): Promise<string> {
  const token = newFeedToken();
  await prisma.user.update({
    where: { id: userId },
    data: { calendarFeedToken: token },
  });
  return token;
}
