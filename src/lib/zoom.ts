import "server-only";
import { prisma } from "@/lib/prisma";
import { getPlatformSettings } from "@/lib/settings";
import { encryptIfConfigured, decryptIfNeeded } from "@/lib/crypto";

// Zoom auto-generated meeting links. Separate per-owner OAuth "connect" flow
// (like Google Calendar) — requires its own Zoom OAuth app (marketplace.zoom.us),
// stored as platform-wide credentials in PlatformSettings (zoomClientId/Secret).
// Granular scopes required on the Zoom app: meeting:write:meeting, user:read:user.

const AUTHORIZE_URL = "https://zoom.us/oauth/authorize";
const TOKEN_URL = "https://zoom.us/oauth/token";
const API_BASE = "https://api.zoom.us/v2";
const CONNECT_SCOPE = "meeting:write:meeting user:read:user";

function appUrl(origin?: string): string {
  return origin || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

export function zoomRedirectUri(origin?: string): string {
  return `${appUrl(origin)}/api/calendar/zoom/callback`;
}

async function zoomCreds() {
  const settings = await getPlatformSettings();
  return {
    clientId: settings.zoomClientId,
    clientSecret: settings.zoomClientSecret,
  };
}

export async function isZoomConfigurable(): Promise<boolean> {
  const { clientId, clientSecret } = await zoomCreds();
  return Boolean(clientId && clientSecret);
}

export async function buildZoomAuthorizeUrl(state: string, origin?: string): Promise<string | null> {
  const { clientId } = await zoomCreds();
  if (!clientId) return null;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: zoomRedirectUri(origin),
    response_type: "code",
    scope: CONNECT_SCOPE,
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
};

function basicAuthHeader(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

// Exchange the authorization code, fetch the connected account's email, and
// persist the connection for the given user. Throws on failure.
export async function connectZoom(userId: string, code: string, origin?: string): Promise<void> {
  const { clientId, clientSecret } = await zoomCreds();
  if (!clientId || !clientSecret) throw new Error("Zoom is not configured.");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(clientId, clientSecret),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: zoomRedirectUri(origin),
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`);

  const tokens = (await res.json()) as TokenResponse;
  if (!tokens.refresh_token) {
    throw new Error("No refresh token returned. Please try connecting again.");
  }

  let accountEmail = "";
  try {
    const meRes = await fetch(`${API_BASE}/users/me`, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (meRes.ok) {
      const me = (await meRes.json()) as { email?: string };
      accountEmail = (me.email || "").toLowerCase();
    }
  } catch {
    // Non-fatal; we can still store the tokens without the display email.
  }

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

  await prisma.calendarConnection.upsert({
    where: { userId_provider: { userId, provider: "zoom" } },
    create: {
      userId,
      provider: "zoom",
      accountEmail,
      accessToken: encryptIfConfigured(tokens.access_token),
      refreshToken: encryptIfConfigured(tokens.refresh_token),
      expiresAt,
      scope: tokens.scope,
    },
    update: {
      accountEmail,
      accessToken: encryptIfConfigured(tokens.access_token),
      refreshToken: encryptIfConfigured(tokens.refresh_token),
      expiresAt,
      scope: tokens.scope,
    },
  });
}

export async function getZoomConnection(userId: string) {
  return prisma.calendarConnection.findUnique({
    where: { userId_provider: { userId, provider: "zoom" } },
  });
}

export async function disconnectZoom(userId: string): Promise<void> {
  await prisma.calendarConnection.deleteMany({ where: { userId, provider: "zoom" } });
}

// Return a valid access token for the user, refreshing it if it's within 60s of
// expiry. Returns null if the user has no connection or the refresh fails.
export async function getValidZoomAccessToken(userId: string): Promise<string | null> {
  const conn = await prisma.calendarConnection.findUnique({
    where: { userId_provider: { userId, provider: "zoom" } },
  });
  if (!conn) return null;

  if (conn.expiresAt.getTime() - Date.now() > 60_000) {
    return decryptIfNeeded(conn.accessToken);
  }

  const { clientId, clientSecret } = await zoomCreds();
  if (!clientId || !clientSecret) return null;

  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: basicAuthHeader(clientId, clientSecret),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: decryptIfNeeded(conn.refreshToken),
      }),
    });
    if (!res.ok) {
      console.error("Zoom token refresh failed:", await res.text());
      return null;
    }
    const tokens = (await res.json()) as TokenResponse;
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
    await prisma.calendarConnection.update({
      where: { userId_provider: { userId, provider: "zoom" } },
      data: {
        accessToken: encryptIfConfigured(tokens.access_token),
        // Zoom rotates the refresh token on every refresh — persist the new one.
        ...(tokens.refresh_token ? { refreshToken: encryptIfConfigured(tokens.refresh_token) } : {}),
        expiresAt,
      },
    });
    return tokens.access_token;
  } catch (err) {
    console.error("Zoom token refresh error:", err);
    return null;
  }
}

export type ZoomMeeting = { meetingUrl: string; meetingId: string };

// Create a Zoom meeting for the owner. Returns the join URL + meeting id, or
// null on any failure (caller must degrade gracefully — a booking never fails
// just because the Zoom link couldn't be made).
export async function createZoomMeeting(input: {
  userId: string;
  topic: string;
  startUtc: Date;
  endUtc: Date;
  timeZone: string;
}): Promise<ZoomMeeting | null> {
  const accessToken = await getValidZoomAccessToken(input.userId);
  if (!accessToken) return null;

  const durationMinutes = Math.round((input.endUtc.getTime() - input.startUtc.getTime()) / 60_000);

  try {
    const res = await fetch(`${API_BASE}/users/me/meetings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        topic: input.topic,
        type: 2, // scheduled meeting
        start_time: input.startUtc.toISOString(),
        duration: durationMinutes,
        timezone: input.timeZone,
        settings: { join_before_host: true },
      }),
    });
    if (!res.ok) {
      console.error("Zoom meeting create failed:", await res.text());
      return null;
    }
    const meeting = (await res.json()) as { id: number; join_url?: string };
    if (!meeting.join_url) return null;
    return { meetingUrl: meeting.join_url, meetingId: String(meeting.id) };
  } catch (err) {
    console.error("Zoom meeting create error:", err);
    return null;
  }
}

// Move an existing Zoom meeting to a new time (used on reschedule). Keeps the
// same join URL. Best-effort: failures are logged, never thrown.
export async function updateZoomMeetingTime(input: {
  userId: string;
  meetingId: string;
  startUtc: Date;
  endUtc: Date;
  timeZone: string;
}): Promise<void> {
  const accessToken = await getValidZoomAccessToken(input.userId);
  if (!accessToken) return;

  const durationMinutes = Math.round((input.endUtc.getTime() - input.startUtc.getTime()) / 60_000);

  try {
    await fetch(`${API_BASE}/meetings/${encodeURIComponent(input.meetingId)}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        start_time: input.startUtc.toISOString(),
        duration: durationMinutes,
        timezone: input.timeZone,
      }),
    });
  } catch (err) {
    console.error("Zoom meeting update error:", err);
  }
}

// Delete a Zoom meeting (used on cancel). Best-effort.
export async function deleteZoomMeeting(userId: string, meetingId: string): Promise<void> {
  const accessToken = await getValidZoomAccessToken(userId);
  if (!accessToken) return;

  try {
    await fetch(`${API_BASE}/meetings/${encodeURIComponent(meetingId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch (err) {
    console.error("Zoom meeting delete error:", err);
  }
}
