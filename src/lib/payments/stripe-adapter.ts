import "server-only";
import Stripe from "stripe";
import { getActiveStripeConfig } from "@/lib/stripe";
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

// Stripe Connect (separate charges & transfers). All PaymentAdapter methods
// are implemented — onboarding (4.3), checkout/webhook (4.5), release (4.6),
// refund/reverse (4.7).

// Lazily construct a Stripe client for the platform account. Throws a
// distinct error when unconfigured so the settings UI can surface it clearly
// (as opposed to a generic ProviderNotImplementedError, which would suggest
// the code path itself is unfinished).
async function stripeClient(): Promise<Stripe> {
  const cfg = await getActiveStripeConfig();
  if (!cfg.secretKey) {
    throw new Error("Stripe is not configured. Add a secret key in /admin/settings.");
  }
  return new Stripe(cfg.secretKey);
}

export const stripeAdapter: PaymentAdapter = {
  provider: "STRIPE",

  async createLinkedAccount(input: CreateLinkedAccountInput): Promise<CreateLinkedAccountResult> {
    const stripe = await stripeClient();
    // Express account = Stripe-hosted onboarding + Stripe handles KYC/1099s,
    // per the Feature 4 plan. We only ask for `transfers` because our money
    // model is separate charges & transfers — the platform is merchant of
    // record so we don't need `card_payments` on the connected account.
    const account = await stripe.accounts.create({
      type: "express",
      country: input.country,
      email: input.businessEmail,
      business_profile: { name: input.businessName },
      capabilities: { transfers: { requested: true } },
      metadata: { tenantId: input.tenantId },
    });
    return { accountId: account.id };
  },

  async createOnboardingLink(input: CreateOnboardingLinkInput): Promise<CreateOnboardingLinkResult> {
    const stripe = await stripeClient();
    const link = await stripe.accountLinks.create({
      account: input.accountId,
      refresh_url: input.refreshUrl,
      return_url: input.returnUrl,
      type: "account_onboarding",
    });
    return { url: link.url };
  },

  async getOnboardingStatus(accountId: string): Promise<OnboardingStatus> {
    const stripe = await stripeClient();
    const account = await stripe.accounts.retrieve(accountId);
    // charges_enabled is the "ready to accept money" flag; payouts_enabled
    // gates release to the tenant's bank. We track charges_enabled here
    // because Phase 4.5's checkout needs it — payouts_enabled is re-checked
    // at release time in Phase 4.6.
    const ready = Boolean(account.charges_enabled);
    const disabled = account.requirements?.disabled_reason ?? undefined;
    return { ready, reason: disabled };
  },

  async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    const stripe = await stripeClient();
    // Escrow model (Feature 4 plan): charge on the PLATFORM account. Money
    // sits in the platform's Stripe balance until the release cron in Phase
    // 4.6 creates a Transfer to the tenant's connected account. No
    // transfer_data / application_fee_amount here — that would auto-route
    // funds and defeat the "held until service delivered" guarantee.
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: input.price.currency.toLowerCase(),
            unit_amount: input.price.amount,
            product_data: { name: input.description },
          },
          quantity: 1,
        },
      ],
      customer_email: input.invitee.email,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      // The webhook handler looks bookings up by session id
      // (providerPaymentId column), so this metadata is a belt-and-braces
      // safety net rather than the primary key.
      metadata: { bookingId: input.bookingId, tenantId: input.tenantId },
      payment_intent_data: {
        metadata: { bookingId: input.bookingId, tenantId: input.tenantId },
      },
    });
    if (!session.url) throw new Error("Stripe didn't return a checkout URL.");
    return { url: session.url, providerPaymentId: session.id };
  },

  async verifyWebhook(input: WebhookVerifyInput): Promise<WebhookEvent> {
    const { webhookSecret } = await getActiveStripeConfig();
    if (!webhookSecret) {
      throw new Error("Stripe webhook secret not configured.");
    }
    const stripe = await stripeClient();
    // constructEvent verifies the signature — throws on mismatch, which the
    // route handler surfaces as 400 without touching the DB.
    const event = stripe.webhooks.constructEvent(input.rawBody, input.signature, webhookSecret);
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as import("stripe").Stripe.Checkout.Session;
      const bookingId = session.metadata?.bookingId;
      if (!bookingId) return { type: "unhandled", providerEventType: event.type };
      const amount = session.amount_total ?? 0;
      const currency = (session.currency ?? "usd").toUpperCase();
      return {
        type: "payment.succeeded",
        providerPaymentId: session.id,
        bookingId,
        amount: { amount, currency },
      };
    }
    if (event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_failed") {
      const session = event.data.object as import("stripe").Stripe.Checkout.Session;
      const bookingId = session.metadata?.bookingId;
      if (!bookingId) return { type: "unhandled", providerEventType: event.type };
      return { type: "payment.failed", providerPaymentId: session.id, bookingId };
    }
    return { type: "unhandled", providerEventType: event.type };
  },
  async releaseTransfer(input: ReleaseTransferInput): Promise<ReleaseTransferResult> {
    const stripe = await stripeClient();
    // Move funds from the platform's Stripe balance to the tenant's connected
    // account. transfer_group + metadata link this to the booking for audit;
    // the Idempotency-Key header guarantees at-most-once creation across cron
    // retries — critical because a duplicate transfer moves real money twice.
    const transfer = await stripe.transfers.create(
      {
        amount: input.amount.amount,
        currency: input.amount.currency.toLowerCase(),
        destination: input.tenantConnectAccountId,
        transfer_group: `booking_${input.bookingId}`,
        metadata: { bookingId: input.bookingId, tenantId: input.tenantId },
      },
      { idempotencyKey: input.idempotencyKey },
    );
    return { transferId: transfer.id };
  },
  async refund(input: RefundInput): Promise<RefundResult> {
    const stripe = await stripeClient();
    // providerPaymentId on Booking is the Checkout Session id (cs_...), not a
    // charge/payment_intent — Stripe's refund API needs the latter, so we
    // resolve it first. This only works while the session is still resolvable
    // (Stripe keeps them indefinitely), and only applies while funds are HELD
    // on the platform — refunding after a transfer would need reverseTransfer
    // as well (the caller in Phase 4.7's action decides which to call based on
    // payoutStatus).
    const session = await stripe.checkout.sessions.retrieve(input.providerPaymentId);
    const paymentIntentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id;
    if (!paymentIntentId) {
      throw new Error("Checkout session has no payment_intent — was it ever paid?");
    }
    const refund = await stripe.refunds.create(
      {
        payment_intent: paymentIntentId,
        ...(input.amount ? { amount: input.amount.amount } : {}),
        metadata: { bookingId: input.bookingId },
      },
      { idempotencyKey: input.idempotencyKey },
    );
    return { refundId: refund.id };
  },

  async reverseTransfer(input: ReverseTransferInput) {
    const stripe = await stripeClient();
    // Pulls funds back from the tenant's Connect balance to the platform —
    // used when a refund is issued after the payout already RELEASED.
    const reversal = await stripe.transfers.createReversal(
      input.transferId,
      {
        ...(input.amount ? { amount: input.amount.amount } : {}),
        metadata: { bookingId: input.bookingId },
      },
      { idempotencyKey: input.idempotencyKey },
    );
    return { reversalId: reversal.id };
  },
};
