import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import type { User } from "@prisma/client";

const COOKIE_NAME = "session";
const SESSION_DAYS = 30;

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(value);
}

// Issue a signed session cookie for the given user id. `impersonatedBy`, when
// set, marks this session as an admin viewing the account as that user —
// the admin's own id is embedded so the session can be switched back.
export async function createSession(userId: string, opts?: { impersonatedBy?: string }) {
  const jwt = new SignJWT({ sub: userId, ...(opts?.impersonatedBy ? { impersonatedBy: opts.impersonatedBy } : {}) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`);
  const token = await jwt.sign(secret());

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

type SessionClaims = { userId: string; impersonatedBy: string | null };

const getSessionClaims = cache(async (): Promise<SessionClaims | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (typeof payload.sub !== "string") return null;
    return {
      userId: payload.sub,
      impersonatedBy: typeof payload.impersonatedBy === "string" ? payload.impersonatedBy : null,
    };
  } catch {
    return null;
  }
});

// Returns the currently logged-in user, or null. Cached per request.
// Suspended or soft-deleted accounts are treated as logged out everywhere.
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const claims = await getSessionClaims();
  if (!claims) return null;
  const user = await prisma.user.findUnique({ where: { id: claims.userId } });
  if (!user || user.suspended || user.deletedAt) return null;
  return user;
});

// If the current session is an admin impersonating another user, returns the
// admin's own user record (for the impersonation banner). Null otherwise.
export const getImpersonator = cache(async (): Promise<User | null> => {
  const claims = await getSessionClaims();
  if (!claims?.impersonatedBy) return null;
  return prisma.user.findUnique({ where: { id: claims.impersonatedBy } });
});

// Short-lived signed cookie set after successful password login but before
// the TOTP challenge. Presence of a `session` cookie is unaffected — this
// uses its own name so an unauthenticated request can never be mistaken
// for a fully authenticated one.
const PENDING_2FA_COOKIE = "session_pending_2fa";

export async function createPending2faToken(userId: string): Promise<void> {
  const jwt = await new SignJWT({ userId, pending: true })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(secret());
  const store = await cookies();
  store.set(PENDING_2FA_COOKIE, jwt, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 300,
  });
}

export async function readPending2fa(): Promise<{ userId: string } | null> {
  const store = await cookies();
  const token = store.get(PENDING_2FA_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.pending && typeof payload.userId === "string") {
      return { userId: payload.userId };
    }
  } catch {
    return null;
  }
  return null;
}

export async function clearPending2fa(): Promise<void> {
  const store = await cookies();
  store.delete(PENDING_2FA_COOKIE);
}
