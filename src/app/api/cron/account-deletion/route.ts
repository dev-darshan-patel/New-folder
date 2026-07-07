import { NextRequest, NextResponse } from "next/server";
import { processDueDeletions, processDuePurges } from "@/lib/account-deletion";

// Runs both halves of self-service account deletion on a schedule:
//   1. Cascade accounts whose grace period has elapsed (cancel bookings +
//      subscription, deactivate, start the 30-day recovery window).
//   2. Hard-purge accounts whose recovery window has elapsed.
// Point a scheduler (Vercel Cron, system cron, etc.) at this endpoint.
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

  const cascaded = await processDueDeletions();
  const purged = await processDuePurges();
  return NextResponse.json({ ok: true, cascaded, purged });
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
