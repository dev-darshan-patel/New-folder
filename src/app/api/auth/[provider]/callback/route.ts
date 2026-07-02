import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForProfile, type OAuthProvider } from "@/lib/oauth";
import { findOrCreateOAuthUser } from "@/lib/oauth-login";
import { createSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const STATE_COOKIE = "oauth_state";

const ERROR_MESSAGES: Record<string, string> = {
  email_not_verified: "oauth_email_unverified",
  suspended: "suspended",
  deleted: "deleted",
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  const loginUrl = new URL("/login", req.url);

  if (provider !== "google" && provider !== "microsoft") {
    loginUrl.searchParams.set("error", "oauth_failed");
    return NextResponse.redirect(loginUrl);
  }

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const expectedState = req.cookies.get(STATE_COOKIE)?.value;

  const fail = (error: string) => {
    loginUrl.searchParams.set("error", error);
    const res = NextResponse.redirect(loginUrl);
    res.cookies.delete(STATE_COOKIE);
    return res;
  };

  if (!code || !state || !expectedState || state !== expectedState) {
    return fail("oauth_failed");
  }

  let profile;
  try {
    profile = await exchangeCodeForProfile(provider as OAuthProvider, code);
  } catch (err) {
    console.error(`OAuth callback (${provider}) failed`, err);
    return fail("oauth_failed");
  }

  const result = await findOrCreateOAuthUser(provider as OAuthProvider, profile);
  if (!result.ok) {
    return fail(ERROR_MESSAGES[result.error] ?? "oauth_failed");
  }

  await createSession(result.userId);
  const loggedInUser = await prisma.user.findUnique({
    where: { id: result.userId },
    select: { adminRole: true },
  });
  const dest = loggedInUser?.adminRole ? "/admin" : "/dashboard";
  const res = NextResponse.redirect(new URL(dest, req.url));
  res.cookies.delete(STATE_COOKIE);
  return res;
}
