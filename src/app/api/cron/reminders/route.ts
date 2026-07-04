import { NextRequest, NextResponse } from "next/server";
import { sendDueReminders } from "@/lib/reminders";
import { cleanupExpiredRateLimits } from "@/lib/rate-limit";

// Trigger reminder emails for upcoming bookings. Point a scheduler (Vercel Cron,
// system cron, etc.) at this endpoint every few minutes.
//
// Auth: set CRON_SECRET in the env, then call with either
//   Authorization: Bearer <secret>   or   ?secret=<secret>
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    const fromHeader = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
    const fromQuery = req.nextUrl.searchParams.get("secret");
    if (fromHeader !== secret && fromQuery !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const result = await sendDueReminders();
  const rateLimitCleaned = await cleanupExpiredRateLimits();
  return NextResponse.json({ ok: true, ...result, rateLimitCleaned });
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
