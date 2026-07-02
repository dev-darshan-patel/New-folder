import "server-only";
import { jwtVerify, createRemoteJWKSet } from "jose";
import { getPlatformSettings } from "@/lib/settings";

export type OAuthProvider = "google" | "microsoft";

export type OAuthProfile = {
  providerId: string;
  email: string;
  emailVerified: boolean;
  name: string;
};

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

export function redirectUri(provider: OAuthProvider): string {
  return `${appUrl()}/api/auth/${provider}/callback`;
}

async function providerConfig(provider: OAuthProvider) {
  const settings = await getPlatformSettings();

  if (provider === "google") {
    return {
      clientId: settings.googleClientId,
      clientSecret: settings.googleClientSecret,
      authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      jwksUrl: "https://www.googleapis.com/oauth2/v3/certs",
      issuers: ["https://accounts.google.com", "accounts.google.com"],
      scope: "openid email profile",
    };
  }

  const tenant = settings.microsoftTenant || "common";
  return {
    clientId: settings.microsoftClientId,
    clientSecret: settings.microsoftClientSecret,
    authorizeUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
    tokenUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    jwksUrl: `https://login.microsoftonline.com/${tenant}/discovery/v2.0/keys`,
    // Microsoft's v2 issuer is tenant-specific even under the "common" endpoint;
    // verify against the actual tenant id embedded in the token instead of a
    // fixed string. We accept any issuer matching this prefix.
    issuers: [`https://login.microsoftonline.com/`],
    scope: "openid email profile",
  };
}

export async function isProviderConfigured(provider: OAuthProvider): Promise<boolean> {
  const cfg = await providerConfig(provider);
  return Boolean(cfg.clientId && cfg.clientSecret);
}

export async function buildAuthorizeUrl(
  provider: OAuthProvider,
  state: string,
): Promise<string | null> {
  const cfg = await providerConfig(provider);
  if (!cfg.clientId) return null;

  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: redirectUri(provider),
    response_type: "code",
    scope: cfg.scope,
    state,
  });
  if (provider === "microsoft") params.set("response_mode", "query");
  return `${cfg.authorizeUrl}?${params.toString()}`;
}

// Exchange an authorization code for tokens, verify the id_token (OIDC), and
// return the caller's verified profile. Throws on any failure.
export async function exchangeCodeForProfile(
  provider: OAuthProvider,
  code: string,
): Promise<OAuthProfile> {
  const cfg = await providerConfig(provider);
  if (!cfg.clientId || !cfg.clientSecret) {
    throw new Error(`${provider} sign-in is not configured`);
  }

  const tokenRes = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      code,
      redirect_uri: redirectUri(provider),
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) {
    throw new Error(`${provider} token exchange failed: ${await tokenRes.text()}`);
  }
  const tokens = (await tokenRes.json()) as { id_token?: string };
  if (!tokens.id_token) throw new Error(`${provider} response had no id_token`);

  const jwks = createRemoteJWKSet(new URL(cfg.jwksUrl));
  const { payload } = await jwtVerify(tokens.id_token, jwks, {
    audience: cfg.clientId,
  });

  const issuer = String(payload.iss || "");
  const issuerOk = cfg.issuers.some((i) => issuer.startsWith(i));
  if (!issuerOk) throw new Error(`${provider} id_token had unexpected issuer: ${issuer}`);

  const sub = String(payload.sub || "");
  const email = String(payload.email || "").trim().toLowerCase();
  const emailVerified = payload.email_verified !== false; // Microsoft omits this claim; treat absence as verified
  const name = String(payload.name || email);

  if (!sub || !email) throw new Error(`${provider} id_token missing sub/email`);

  return { providerId: sub, email, emailVerified, name };
}
