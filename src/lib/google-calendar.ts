import "server-only";
import { jwtVerify, createRemoteJWKSet } from "jose";
import { prisma } from "@/lib/prisma";
import { getPlatformSettings } from "@/lib/settings";
import { encryptIfConfigured, decryptIfNeeded } from "@/lib/crypto";

// Google Calendar integration for the business owner. This is a SEPARATE OAuth
// flow from "Sign in with Google" (src/lib/oauth.ts): login only needs an
// id_token, whereas this needs offline access + the calendar.events scope so we
// can create Google Meet links on the owner's behalf even when they're away.
//
// Reuses the same DB-backed Google client credentials as login (PlatformSettings
// googleClientId/googleClientSecret) — same Google Cloud project, just with the
// Calendar API enabled and the extra scope added to the consent screen.

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const CONNECT_SCOPE = `openid email ${CALENDAR_SCOPE}`;
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

function appUrl(origin?: string): string {
  return origin || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

export function calendarRedirectUri(origin?: string): string {
  return `${appUrl(origin)}/api/calendar/google/callback`;
}

async function googleCreds() {
  const settings = await getPlatformSettings();
  return {
    clientId: settings.googleClientId,
    clientSecret: settings.googleClientSecret,
  };
}

export async function isCalendarConfigurable(): Promise<boolean> {
  const { clientId, clientSecret } = await googleCreds();
  return Boolean(clientId && clientSecret);
}

// Build the "connect your calendar" authorize URL. access_type=offline +
// prompt=consent force Google to return a refresh_token every time.
export async function buildCalendarAuthorizeUrl(
  state: string,
  origin?: string,
): Promise<string | null> {
  const { clientId } = await googleCreds();
  if (!clientId) return null;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: calendarRedirectUri(origin),
    response_type: "code",
    scope: CONNECT_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
    include_granted_scopes: "true",
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  id_token?: string;
};

// Exchange the authorization code, verify the account email from the id_token,
// and persist the connection for the given user. Throws on failure.
export async function connectGoogleCalendar(
  userId: string,
  code: string,
  origin?: string,
): Promise<void> {
  const { clientId, clientSecret } = await googleCreds();
  if (!clientId || !clientSecret) throw new Error("Google is not configured.");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: calendarRedirectUri(origin),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`);

  const tokens = (await res.json()) as TokenResponse;
  if (!tokens.refresh_token) {
    // Happens if the user previously consented and Google withheld a new refresh
    // token. prompt=consent above should prevent this, but guard anyway.
    throw new Error("No refresh token returned. Please try connecting again.");
  }

  // Read the connected account's email from the verified id_token.
  let accountEmail = "";
  if (tokens.id_token) {
    try {
      const jwks = createRemoteJWKSet(new URL(JWKS_URL));
      const { payload } = await jwtVerify(tokens.id_token, jwks, { audience: clientId });
      accountEmail = String(payload.email || "").toLowerCase();
    } catch {
      // Non-fatal; we can still store the tokens without the display email.
    }
  }

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

  await prisma.calendarConnection.upsert({
    where: { userId_provider: { userId, provider: "google" } },
    create: {
      userId,
      provider: "google",
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

export async function getCalendarConnection(userId: string) {
  return prisma.calendarConnection.findUnique({
    where: { userId_provider: { userId, provider: "google" } },
  });
}

export async function disconnectGoogleCalendar(userId: string): Promise<void> {
  await prisma.calendarConnection.deleteMany({ where: { userId, provider: "google" } });
}

// Return a valid access token for the user, refreshing it if it's within 60s of
// expiry. Returns null if the user has no connection or the refresh fails.
export async function getValidAccessToken(userId: string): Promise<string | null> {
  const conn = await prisma.calendarConnection.findUnique({
    where: { userId_provider: { userId, provider: "google" } },
  });
  if (!conn) return null;

  if (conn.expiresAt.getTime() - Date.now() > 60_000) {
    return decryptIfNeeded(conn.accessToken);
  }

  const { clientId, clientSecret } = await googleCreds();
  if (!clientId || !clientSecret) return null;

  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: decryptIfNeeded(conn.refreshToken),
        grant_type: "refresh_token",
      }),
    });
    if (!res.ok) {
      console.error("Google token refresh failed:", await res.text());
      return null;
    }
    const tokens = (await res.json()) as TokenResponse;
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
    await prisma.calendarConnection.update({
      where: { userId_provider: { userId, provider: "google" } },
      data: { accessToken: encryptIfConfigured(tokens.access_token), expiresAt },
    });
    return tokens.access_token;
  } catch (err) {
    console.error("Google token refresh error:", err);
    return null;
  }
}

export type MeetEvent = { meetingUrl: string; calendarEventId: string };

// Create a Google Calendar event WITH a Google Meet conference for the owner.
// Returns the Meet URL + event id, or null on any failure (caller must degrade
// gracefully — a booking never fails just because the Meet link couldn't be made).
export async function createMeetEvent(input: {
  userId: string;
  summary: string;
  description?: string | null;
  startUtc: Date;
  endUtc: Date;
  timeZone: string;
  attendees: { email: string; name?: string }[];
}): Promise<MeetEvent | null> {
  const accessToken = await getValidAccessToken(input.userId);
  if (!accessToken) return null;

  const body = {
    summary: input.summary,
    description: input.description ?? undefined,
    start: { dateTime: input.startUtc.toISOString(), timeZone: input.timeZone },
    end: { dateTime: input.endUtc.toISOString(), timeZone: input.timeZone },
    attendees: input.attendees.map((a) => ({ email: a.email, displayName: a.name })),
    conferenceData: {
      createRequest: {
        requestId: crypto.randomUUID(),
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    },
  };

  try {
    const res = await fetch(`${EVENTS_URL}?conferenceDataVersion=1&sendUpdates=none`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error("Google Meet event create failed:", await res.text());
      return null;
    }
    const event = (await res.json()) as {
      id: string;
      hangoutLink?: string;
      conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
    };
    const meetingUrl =
      event.hangoutLink ??
      event.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")?.uri;
    if (!meetingUrl) return null;
    return { meetingUrl, calendarEventId: event.id };
  } catch (err) {
    console.error("Google Meet event create error:", err);
    return null;
  }
}

// Move an existing calendar event to a new time (used on reschedule). Keeps the
// same Meet link. Best-effort: failures are logged, never thrown.
export async function updateMeetEventTime(input: {
  userId: string;
  calendarEventId: string;
  startUtc: Date;
  endUtc: Date;
  timeZone: string;
}): Promise<void> {
  const accessToken = await getValidAccessToken(input.userId);
  if (!accessToken) return;

  try {
    await fetch(
      `${EVENTS_URL}/${encodeURIComponent(input.calendarEventId)}?sendUpdates=none`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          start: { dateTime: input.startUtc.toISOString(), timeZone: input.timeZone },
          end: { dateTime: input.endUtc.toISOString(), timeZone: input.timeZone },
        }),
      },
    );
  } catch (err) {
    console.error("Google Meet event update error:", err);
  }
}

// Delete a calendar event (used on cancel). Best-effort.
export async function deleteMeetEvent(userId: string, calendarEventId: string): Promise<void> {
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) return;

  try {
    await fetch(
      `${EVENTS_URL}/${encodeURIComponent(calendarEventId)}?sendUpdates=none`,
      { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } },
    );
  } catch (err) {
    console.error("Google Meet event delete error:", err);
  }
}
