import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import logger from "@/lib/logger";

// Durable, deduplicated server-error capture.
//
// Errors already went to pino, but those logs are ephemeral on serverless and
// unread on a VPS — the practical result was that nobody found out something
// had broken until a customer said so. This stores them where an admin will
// actually see them (/admin/errors) and optionally emails the first sighting.
//
// Everything here is best-effort and MUST NOT throw: this code runs on the
// error path, and an exception thrown while reporting an exception replaces a
// useful error with a confusing one.

const MAX_MESSAGE = 500;
const MAX_STACK = 4000;

// Group by what the problem IS, not by every incidental difference — the
// message plus the route it happened on. Identifiers are masked first, so
// "Booking 123 not found" and "Booking 999 not found" collapse into one row
// with a count instead of one row per record, which is what would otherwise
// let a single hot error bury every other problem in the table.
//
// The id rule is "long alphanumeric token containing at least one digit"
// rather than a hex match: this app's ids are cuids (`cmt9a0f3b0001`), which
// contain letters well outside a-f, so a hex-only rule silently failed to
// group exactly the ids that appear most often. Requiring a digit is what
// keeps ordinary long words ("authentication") from being masked away, which
// would collapse genuinely different errors together.
export function fingerprintOf(message: string, routePath?: string | null): string {
  const normalized = message
    .replace(/\b(?=[a-z0-9]*\d)[a-z0-9]{8,}\b/gi, "<id>")
    .replace(/\d+/g, "<n>")
    .slice(0, MAX_MESSAGE);
  return createHash("sha256").update(`${routePath ?? ""}|${normalized}`).digest("hex").slice(0, 32);
}

export type CaptureContext = {
  routePath?: string | null;
  method?: string | null;
  routeType?: string | null;
};

export async function captureError(err: unknown, ctx: CaptureContext = {}): Promise<void> {
  try {
    const message = (err instanceof Error ? err.message : String(err)).slice(0, MAX_MESSAGE);
    if (!message) return;
    const stack = err instanceof Error && err.stack ? err.stack.slice(0, MAX_STACK) : null;
    const fingerprint = fingerprintOf(message, ctx.routePath);
    const now = new Date();

    // upsert is what makes this safe to call from anywhere at any rate: two
    // simultaneous occurrences of the same error can't create two rows, and a
    // recurrence just bumps the counter.
    const existing = await prisma.errorEvent.findUnique({
      where: { fingerprint },
      select: { id: true, resolvedAt: true },
    });

    await prisma.errorEvent.upsert({
      where: { fingerprint },
      create: {
        fingerprint,
        message,
        stack,
        routePath: ctx.routePath ?? null,
        method: ctx.method ?? null,
        routeType: ctx.routeType ?? null,
        lastSeenAt: now,
      },
      update: {
        count: { increment: 1 },
        lastSeenAt: now,
        // Keep the newest stack — it's the one an admin can act on now.
        stack,
        // A recurrence un-resolves it. "Resolved" must never be able to hide a
        // problem that came back.
        resolvedAt: null,
      },
    });

    // Alert only on a genuinely new problem, or one that had been marked
    // resolved and has returned. Emailing every occurrence is how alerting
    // becomes noise that everyone filters away.
    const isNew = !existing;
    const hasReturned = !!existing?.resolvedAt;
    if (isNew || hasReturned) {
      await alertAdmins({ message, routePath: ctx.routePath ?? null, hasReturned });
    }
  } catch (captureErr) {
    // Never let error capture become the error. Log and move on.
    logger.error({ err: captureErr }, "captureError failed");
  }
}

async function alertAdmins(p: {
  message: string;
  routePath: string | null;
  hasReturned: boolean;
}): Promise<void> {
  try {
    const settings = await prisma.platformSettings.findUnique({
      where: { id: "singleton" },
      select: { alertEmail: true },
    });
    const to = settings?.alertEmail?.trim();
    if (!to) return;

    // Imported lazily: this path is cold, and pulling the mail stack into
    // every module that might capture an error isn't worth it.
    const { sendEmail } = await import("@/lib/email");
    const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    await sendEmail({
      to,
      subject: `[Bookify] ${p.hasReturned ? "Error returned" : "New error"}: ${p.message.slice(0, 80)}`,
      text:
        `${p.hasReturned ? "An error previously marked resolved has come back." : "A new error was captured."}\n\n` +
        `Message: ${p.message}\n` +
        `Route: ${p.routePath ?? "(unknown)"}\n\n` +
        `See all errors: ${base}/admin/errors\n`,
    });
  } catch (err) {
    logger.error({ err }, "Failed to send error alert email");
  }
}

// Keep the table small enough to be free to retain: drop resolved errors that
// haven't recurred in a while, and any error untouched for a long time.
// Called from the existing cron tick rather than a new schedule.
export async function pruneOldErrors(): Promise<number> {
  const resolvedCutoff = new Date(Date.now() - 30 * 86_400_000);
  const staleCutoff = new Date(Date.now() - 90 * 86_400_000);
  try {
    const { count } = await prisma.errorEvent.deleteMany({
      where: {
        OR: [
          { resolvedAt: { not: null }, lastSeenAt: { lt: resolvedCutoff } },
          { lastSeenAt: { lt: staleCutoff } },
        ],
      },
    });
    return count;
  } catch (err) {
    logger.error({ err }, "pruneOldErrors failed");
    return 0;
  }
}
