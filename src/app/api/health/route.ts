import { prisma } from "@/lib/prisma";

// Uptime probe. Point an external monitor (UptimeRobot, Better Stack, a Vercel
// check, `curl` from cron — anything) at this and get alerted when the app
// stops serving. Deliberately dependency-free and provider-agnostic: the
// deployment target is either Vercel or a self-hosted VPS, and a monitor that
// only works on one of them isn't much use.
//
// It checks the DATABASE, not just that Node is alive. A process that responds
// but can't reach Postgres serves errors on every real page, and a health
// check that stays green through that is worse than none — it actively
// suppresses the alert you needed.
//
// Public and unauthenticated, so it must never leak anything: no version, no
// connection string, no error text. Just up or down.
export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json(
      { status: "ok", checks: { database: "ok" }, latencyMs: Date.now() - startedAt },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    // 503 rather than 500: this is "dependency unavailable", which is what
    // monitors and load balancers are looking for.
    return Response.json(
      { status: "degraded", checks: { database: "failed" }, latencyMs: Date.now() - startedAt },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

// Monitors often prefer HEAD; same check, no body.
export async function HEAD() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return new Response(null, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch {
    return new Response(null, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
