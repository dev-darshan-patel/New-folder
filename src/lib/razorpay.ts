import "server-only";
import { getPlatformSettings } from "@/lib/settings";

// Razorpay platform-account credentials, mirroring the shape/rules of
// getActiveStripeConfig(). Test and live never mix — whichever mode is set,
// only that mode's keys are ever returned.

export type ActiveRazorpayConfig = {
  mode: "TEST" | "LIVE";
  keyId: string | null;
  keySecret: string | null;
  webhookSecret: string | null;
};

export async function getActiveRazorpayConfig(): Promise<ActiveRazorpayConfig> {
  const settings = await getPlatformSettings();
  if (settings.razorpayMode === "LIVE") {
    return {
      mode: "LIVE",
      keyId: settings.razorpayLiveKeyId,
      keySecret: settings.razorpayLiveKeySecret,
      webhookSecret: settings.razorpayLiveWebhookSecret,
    };
  }
  return {
    mode: "TEST",
    keyId: settings.razorpayTestKeyId,
    keySecret: settings.razorpayTestKeySecret,
    webhookSecret: settings.razorpayTestWebhookSecret,
  };
}

export async function isRazorpayConfigured(): Promise<boolean> {
  const { keyId, keySecret } = await getActiveRazorpayConfig();
  return Boolean(keyId && keySecret);
}

// HTTP Basic auth header for Razorpay's REST API. Codebase-consistent with
// how Zoom's REST calls are made — no SDK dependency needed.
export function razorpayAuthHeader(keyId: string, keySecret: string): string {
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
}
