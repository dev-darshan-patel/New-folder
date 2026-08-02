import "server-only";
import { prisma } from "@/lib/prisma";
import { decryptIfNeeded } from "@/lib/crypto";
import type { PlatformSettings } from "@prisma/client";

const SETTINGS_ID = "singleton";

// Every PlatformSettings field that holds a real secret (as opposed to a
// public-ish id like a Stripe publishable key or an OAuth client id).
// Encrypted at rest by the corresponding admin action; decrypted once here so
// every other call site (getStripe, getActiveRazorpayConfig, oauth.ts,
// email.ts, ...) keeps reading plain strings without knowing about crypto.
const SECRET_FIELDS = [
  "stripeTestSecretKey",
  "stripeTestWebhookSecret",
  "stripeLiveSecretKey",
  "stripeLiveWebhookSecret",
  "razorpayTestKeySecret",
  "razorpayTestWebhookSecret",
  "razorpayLiveKeySecret",
  "razorpayLiveWebhookSecret",
  "googleClientSecret",
  "microsoftClientSecret",
  "zoomClientSecret",
  "gmailSmtpPass",
  "sesSmtpPass",
  "vercelBlobReadWriteToken",
  "s3SecretAccessKey",
] as const satisfies readonly (keyof PlatformSettings)[];

function decryptSecrets(row: PlatformSettings): PlatformSettings {
  const out = { ...row };
  for (const field of SECRET_FIELDS) {
    const value = out[field];
    if (typeof value === "string" && value) {
      out[field] = decryptIfNeeded(value);
    }
  }
  return out;
}

// Fetches the one platform-settings row, creating it with defaults on first
// access. Not React-cached: callers that mutate settings need the next read
// (even within the same request, e.g. after revalidatePath) to see fresh data.
export async function getPlatformSettings() {
  const existing = await prisma.platformSettings.findUnique({ where: { id: SETTINGS_ID } });
  const row = existing ?? (await prisma.platformSettings.create({ data: { id: SETTINGS_ID } }));
  return decryptSecrets(row);
}

export { SETTINGS_ID, SECRET_FIELDS as PLATFORM_SETTINGS_SECRET_FIELDS };
