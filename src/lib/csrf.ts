import "server-only";

// Verify that a mutating request comes from our own origin (CSRF protection
// for API route handlers that aren't server actions — server actions get this
// automatically from Next.js).
export function verifyCsrfOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  try {
    const allowed = new URL(appUrl).origin;
    return origin === allowed;
  } catch {
    return false;
  }
}
