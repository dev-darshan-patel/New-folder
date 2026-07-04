import "server-only";
import { prisma } from "@/lib/prisma";

// Postgres-backed sliding-window rate limiter. Shared across all serverless
// instances — unlike the old in-memory Map, a cold start doesn't reset counters.

// Returns true when the call is allowed, false when rate-limited.
export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowMs);
  const expiresAt = new Date(now.getTime() + windowMs);

  try {
    const row = await prisma.rateLimit.findUnique({ where: { key } });

    if (!row || row.windowStart < windowStart) {
      // No record or window expired — start fresh.
      await prisma.rateLimit.upsert({
        where: { key },
        create: { key, count: 1, windowStart: now, expiresAt },
        update: { count: 1, windowStart: now, expiresAt },
      });
      return true;
    }

    if (row.count >= limit) return false;

    await prisma.rateLimit.update({
      where: { key },
      data: { count: { increment: 1 }, expiresAt },
    });
    return true;
  } catch {
    // If the DB is unreachable, fail open — don't block legitimate users.
    return true;
  }
}

// Periodically clean up expired rows. Called from the cron endpoint so it
// doesn't add latency to user-facing requests.
export async function cleanupExpiredRateLimits(): Promise<number> {
  const { count } = await prisma.rateLimit.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return count;
}

// Best-effort client IP from proxy headers; falls back to "unknown".
export async function clientIp(): Promise<string> {
  const { headers } = await import("next/headers");
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return h.get("x-real-ip") ?? "unknown";
}
