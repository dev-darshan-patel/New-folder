import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { buildAuthorizeUrl, type OAuthProvider } from "@/lib/oauth";
import { isFeatureEnabled } from "@/lib/feature-flags";

const STATE_COOKIE = "oauth_state";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  if (provider !== "google" && provider !== "microsoft") {
    return NextResponse.redirect(new URL("/login?error=oauth_failed", req.url));
  }

  if (!(await isFeatureEnabled("oauth_login"))) {
    return NextResponse.redirect(new URL("/login?error=oauth_disabled", req.url));
  }

  const state = crypto.randomUUID();
  const url = await buildAuthorizeUrl(provider as OAuthProvider, state);
  if (!url) {
    return NextResponse.redirect(new URL("/login?error=oauth_not_configured", req.url));
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
