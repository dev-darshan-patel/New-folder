import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getCurrentUser } from "@/lib/auth";
import { buildZoomAuthorizeUrl } from "@/lib/zoom";

const STATE_COOKIE = "zoom_oauth_state";

// Kicks off the "Connect Zoom" flow for the logged-in owner. Requires an
// existing session — we're linking a Zoom account to the current tenant, not
// authenticating a new one.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const state = crypto.randomUUID();
  const origin = new URL(req.url).origin;
  const url = await buildZoomAuthorizeUrl(state, origin);
  if (!url) {
    return NextResponse.redirect(
      new URL("/dashboard/settings?zoom=not_configured", req.url),
    );
  }

  const res = NextResponse.redirect(url);
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
