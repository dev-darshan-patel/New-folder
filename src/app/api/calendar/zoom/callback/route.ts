import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectZoom } from "@/lib/zoom";
import logger from "@/lib/logger";

const STATE_COOKIE = "zoom_oauth_state";

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
    settingsUrl.searchParams.set("zoom", status);
    const res = NextResponse.redirect(settingsUrl);
    res.cookies.delete(STATE_COOKIE);
    return res;
  };

  // User denied consent at Zoom's screen.
  if (providerError) return finish("denied");
  if (!code || !state || !expectedState || state !== expectedState) {
    return finish("error");
  }

  try {
    const origin = new URL(req.url).origin;
    await connectZoom(user.id, code, origin);
  } catch (err) {
    logger.error({ err, userId: user.id }, "Zoom connect failed");
    return finish("error");
  }

  return finish("connected");
}
