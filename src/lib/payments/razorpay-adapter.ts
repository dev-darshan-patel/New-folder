import "server-only";
import crypto from "node:crypto";
import { getActiveRazorpayConfig, razorpayAuthHeader } from "@/lib/razorpay";
import {
  type PaymentAdapter,
  type CreateLinkedAccountInput,
  type CreateLinkedAccountResult,
  type CreateOnboardingLinkInput,
  type CreateOnboardingLinkResult,
  type OnboardingStatus,
  type CheckoutInput,
  type CheckoutResult,
  type WebhookVerifyInput,
  type WebhookEvent,
  type ReleaseTransferInput,
  type ReleaseTransferResult,
  type RefundInput,
  type RefundResult,
  type ReverseTransferInput,
} from "./provider";

// Razorpay Route linked-account adapter. All PaymentAdapter methods are
// implemented — onboarding (4.3), checkout/webhook (4.5), release (4.6),
// refund/reverse (4.7).

const API_BASE = "https://api.razorpay.com";

async function razorpayCreds(): Promise<{ auth: string }> {
  const cfg = await getActiveRazorpayConfig();
  if (!cfg.keyId || !cfg.keySecret) {
    throw new Error("Razorpay is not configured. Add key id + secret in /admin/payments.");
  }
  return { auth: razorpayAuthHeader(cfg.keyId, cfg.keySecret) };
}

async function razorpayFetch(path: string, init: RequestInit & { auth: string }): Promise<unknown> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: init.auth,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Razorpay ${init.method ?? "GET"} ${path} failed (${res.status}): ${body}`);
  }
  return res.json();
}

export const razorpayAdapter: PaymentAdapter = {
  provider: "RAZORPAY",

  async createLinkedAccount(input: CreateLinkedAccountInput): Promise<CreateLinkedAccountResult> {
    const { auth } = await razorpayCreds();
    // Razorpay Route uses the "partner"-style Accounts API: create the sub-
    // merchant account first, then request the "route" product to activate
    // marketplace flows. This first call captures identity — Razorpay's own
    // hosted onboarding fills in KYC + bank details afterwards.
    const created = (await razorpayFetch("/v2/accounts", {
      method: "POST",
      auth,
      body: JSON.stringify({
        email: input.businessEmail,
        phone: "0000000000", // required by API; tenant edits in hosted onboarding
        legal_business_name: input.businessName,
        business_type: "individual",
        contact_name: input.businessName,
        profile: { category: "healthcare", subcategory: "physician", addresses: {} },
        reference_id: input.tenantId,
      }),
    })) as { id: string };
    return { accountId: created.id };
  },

  async createOnboardingLink(input: CreateOnboardingLinkInput): Promise<CreateOnboardingLinkResult> {
    const { auth } = await razorpayCreds();
    // Requesting the "route" product returns an activation URL Razorpay hosts.
    // The tenant completes KYC + bank details there; on finish, Razorpay
    // redirects back to input.returnUrl.
    const product = (await razorpayFetch(`/v2/accounts/${encodeURIComponent(input.accountId)}/products`, {
      method: "POST",
      auth,
      body: JSON.stringify({
        product_name: "route",
        tnc_accepted: true,
      }),
    })) as { activation_status?: string; hosted_onboarding?: { url?: string } };
    const url = product.hosted_onboarding?.url;
    if (!url) {
      throw new Error("Razorpay didn't return an onboarding URL. Check the platform account's Route access.");
    }
    // Razorpay's activation URL doesn't itself carry a return_url callback,
    // so the tenant returns to us via the settings page they came from. We
    // stamp the intended returnUrl on the tenant's session cookie on start
    // instead of relying on the provider to honor it.
    void input.returnUrl;
    void input.refreshUrl;
    return { url };
  },

  async getOnboardingStatus(accountId: string): Promise<OnboardingStatus> {
    const { auth } = await razorpayCreds();
    const account = (await razorpayFetch(`/v2/accounts/${encodeURIComponent(accountId)}`, {
      method: "GET",
      auth,
    })) as { status?: string; activation_status?: string };
    // "activated" is Razorpay's terminal "ready to transact" state. The other
    // values ("created", "under_review", "needs_clarification") all map to
    // "not ready yet"; the tenant sees a spinner + a refresh button.
    const status = account.status ?? account.activation_status;
    return {
      ready: status === "activated",
      reason: status && status !== "activated" ? status : undefined,
    };
  },

  async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    const { auth } = await razorpayCreds();
    // Payment Links are Razorpay's hosted checkout: a POST creates the link,
    // Razorpay serves the payment page, and a `payment_link.paid` webhook
    // fires on completion. Escrow model: the charge lands in the PLATFORM
    // Razorpay balance; the release cron (Phase 4.6) creates the on_hold=false
    // Route transfer to the tenant's linked account.
    const created = (await razorpayFetch("/v1/payment_links", {
      method: "POST",
      auth,
      body: JSON.stringify({
        amount: input.price.amount,
        currency: input.price.currency,
        description: input.description,
        customer: { email: input.invitee.email, name: input.invitee.name },
        notify: { email: false, sms: false },
        callback_url: input.successUrl,
        callback_method: "get",
        // Notes are Razorpay's version of Stripe metadata — echoed back in
        // both the API response AND every payment webhook, which is how the
        // route handler locates our booking without trusting client state.
        notes: { bookingId: input.bookingId, tenantId: input.tenantId },
      }),
    })) as { id: string; short_url: string };
    return { url: created.short_url, providerPaymentId: created.id };
  },

  async verifyWebhook(input: WebhookVerifyInput): Promise<WebhookEvent> {
    const { webhookSecret } = await getActiveRazorpayConfig();
    if (!webhookSecret) throw new Error("Razorpay webhook secret not configured.");
    // Razorpay's webhook signature is an HMAC-SHA256 hex digest of the raw
    // body keyed with the webhook secret. Constant-time compare via
    // crypto.timingSafeEqual so a mismatched signature can't be probed.
    const expected = crypto.createHmac("sha256", webhookSecret).update(input.rawBody).digest("hex");
    const provided = Buffer.from(input.signature, "utf8");
    const computed = Buffer.from(expected, "utf8");
    if (provided.length !== computed.length || !crypto.timingSafeEqual(provided, computed)) {
      throw new Error("Razorpay webhook signature mismatch.");
    }
    const payload = JSON.parse(input.rawBody) as {
      event: string;
      payload: {
        payment_link?: { entity: { id: string; notes?: Record<string, string>; amount?: number; currency?: string } };
        payment?: { entity: { notes?: Record<string, string>; amount?: number; currency?: string } };
      };
    };
    if (payload.event === "payment_link.paid") {
      const link = payload.payload.payment_link?.entity;
      const bookingId = link?.notes?.bookingId;
      if (!link || !bookingId) return { type: "unhandled", providerEventType: payload.event };
      return {
        type: "payment.succeeded",
        providerPaymentId: link.id,
        bookingId,
        amount: { amount: link.amount ?? 0, currency: (link.currency ?? "INR").toUpperCase() },
      };
    }
    if (payload.event === "payment_link.expired" || payload.event === "payment_link.cancelled") {
      const link = payload.payload.payment_link?.entity;
      const bookingId = link?.notes?.bookingId;
      if (!link || !bookingId) return { type: "unhandled", providerEventType: payload.event };
      return { type: "payment.failed", providerPaymentId: link.id, bookingId };
    }
    return { type: "unhandled", providerEventType: payload.event };
  },
  async releaseTransfer(input: ReleaseTransferInput): Promise<ReleaseTransferResult> {
    const { auth } = await razorpayCreds();
    // Razorpay Route direct transfer from the platform account to the tenant's
    // linked account. The X-Payment-ID header would be needed if we were
    // reversing a payment-level Route split; for a direct release the standard
    // /transfers endpoint suffices. Idempotency via X-Razorpay-Request-Idempotency-Key.
    const created = (await razorpayFetch("/v1/transfers", {
      method: "POST",
      auth,
      headers: { "X-Razorpay-Request-Idempotency-Key": input.idempotencyKey },
      body: JSON.stringify({
        account: input.tenantConnectAccountId,
        amount: input.amount.amount,
        currency: input.amount.currency,
        notes: { bookingId: input.bookingId, tenantId: input.tenantId },
      }),
    })) as { id: string };
    return { transferId: created.id };
  },
  async refund(input: RefundInput): Promise<RefundResult> {
    const { auth } = await razorpayCreds();
    // providerPaymentId on Booking is the payment LINK id (plink_...) for
    // Razorpay, but the refund API operates on the underlying payment id —
    // resolve it via the link's own payment history first.
    const link = (await razorpayFetch(`/v1/payment_links/${encodeURIComponent(input.providerPaymentId)}`, {
      method: "GET",
      auth,
    })) as { payments?: { id: string; status: string }[] };
    const paid = link.payments?.find((p) => p.status === "captured");
    if (!paid) {
      throw new Error("Payment link has no captured payment to refund.");
    }
    const refund = (await razorpayFetch(`/v1/payments/${encodeURIComponent(paid.id)}/refund`, {
      method: "POST",
      auth,
      headers: { "X-Razorpay-Request-Idempotency-Key": input.idempotencyKey },
      body: JSON.stringify({
        ...(input.amount ? { amount: input.amount.amount } : {}),
        notes: { bookingId: input.bookingId },
      }),
    })) as { id: string };
    return { refundId: refund.id };
  },

  async reverseTransfer(input: ReverseTransferInput) {
    const { auth } = await razorpayCreds();
    // Pulls funds back from the tenant's linked account after a RELEASED
    // payout — used for refunds issued post-release.
    const reversal = (await razorpayFetch(`/v1/transfers/${encodeURIComponent(input.transferId)}/reversals`, {
      method: "POST",
      auth,
      headers: { "X-Razorpay-Request-Idempotency-Key": input.idempotencyKey },
      body: JSON.stringify({
        ...(input.amount ? { amount: input.amount.amount } : {}),
        notes: { bookingId: input.bookingId },
      }),
    })) as { id: string };
    return { reversalId: reversal.id };
  },
};
