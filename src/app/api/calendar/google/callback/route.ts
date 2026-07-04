import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectGoogleCalendar } from "@/lib/google-calendar";

const STATE_COOKIE = "calendar_oauth_state";

export async function GET(req: NextRequest) {
  const settingsUrl = new URL("/dashboard/settings", req.url);

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const expectedState = req.cookies.get(STATE_COOKIE)?.value;
  const providerError = req.nextUrl.searchParams.get("error");

  const finish = (status: string) => {
    settingsUrl.searchParams.set("calendar", status);
    const res = NextResponse.redirect(settingsUrl);
    res.cookies.delete(STATE_COOKIE);
    return res;
  };

  // User denied consent at Google's screen.
  if (providerError) return finish("denied");
  if (!code || !state || !expectedState || state !== expectedState) {
    return finish("error");
  }

  try {
    const origin = new URL(req.url).origin;
    await connectGoogleCalendar(user.id, code, origin);
  } catch (err) {
    console.error("Google Calendar connect failed", err);
    return finish("error");
  }

  return finish("connected");
}
