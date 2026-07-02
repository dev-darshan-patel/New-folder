import "server-only";

// Simple in-memory sliding-window rate limiter, keyed by an arbitrary string
// (usually "<action>:<ip>" or "<action>:<email>").
//
// NOTE: state is per-process. On serverless/multi-instance deploys each
// instance keeps its own window, so real-world limits are N× looser. That is
// an accepted first line of defense — swap the Map for Redis/Upstash when
// horizontal scaling matters.

type Window = { timestamps: number[] };

const store = new Map<string, Window>();

// Periodically drop stale keys so the map doesn't grow unbounded.
const SWEEP_INTERVAL_MS = 10 * 60_000;
let lastSweep = Date.now();

function sweep(now: number, maxAgeMs: number) {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, win] of store) {
    if (
      win.timestamps.length === 0 ||
      now - win.timestamps[win.timestamps.length - 1] > maxAgeMs
    ) {
      store.delete(key);
    }
  }
}

// Returns true when the call is allowed, false when rate-limited.
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  sweep(now, windowMs);
  const win = store.get(key) ?? { timestamps: [] };
  win.timestamps = win.timestamps.filter((t) => now - t < windowMs);
  if (win.timestamps.length >= limit) {
    store.set(key, win);
    return false;
  }
  win.timestamps.push(now);
  store.set(key, win);
  return true;
}

// Best-effort client IP from proxy headers; falls back to "unknown".
export async function clientIp(): Promise<string> {
  const { headers } = await import("next/headers");
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return h.get("x-real-ip") ?? "unknown";
}
