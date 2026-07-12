import "server-only";

// Provider identifier. Kept as a string union rather than a Prisma enum so
// new providers can be added without a schema migration — same convention as
// booking status / admin role migration in the codebase.
export type PaymentProvider = "STRIPE" | "RAZORPAY";

// The escrow-style money flow is identical across Stripe (separate charges &
// transfers) and Razorpay (Route on_hold transfers). This interface hides the
// provider-specific API shape from the rest of the app — every code path in
// phases 4.5-4.7 will program against `PaymentAdapter`, never Stripe/Razorpay
// SDKs directly.

// Amount is always in the smallest currency unit (cents / paise). The caller
// is responsible for picking the right unit for the currency.
export type Money = { amount: number; currency: string };

export type CheckoutInput = {
  // Our internal booking id — passed back via webhook metadata so we can
  // find the row to CONFIRM without trusting client state.
  bookingId: string;
  tenantId: string;
  invitee: { email: string; name: string };
  price: Money;
  successUrl: string;
  cancelUrl: string;
  // Free-text label surfaced on the customer's statement / receipt.
  description: string;
};

export type CheckoutResult = {
  // Provider's checkout URL — we redirect the customer to this.
  url: string;
  // Provider-specific id we store on Booking.providerPaymentId so later
  // webhook events + refund calls can be tied back to the same intent.
  providerPaymentId: string;
};

export type WebhookVerifyInput = {
  rawBody: string;
  signature: string;
};

export type WebhookEvent =
  | { type: "payment.succeeded"; providerPaymentId: string; bookingId: string; amount: Money }
  | { type: "payment.failed"; providerPaymentId: string; bookingId: string }
  | { type: "unhandled"; providerEventType: string };

export type ReleaseTransferInput = {
  // Our internal id — passed as provider metadata for audit/logging only,
  // never used to hit the provider API.
  tenantId: string;
  // Provider's connected/linked account id (Stripe acct_*, Razorpay acc_*).
  // Must already be in `<provider>ConnectReady`=true state on User.
  tenantConnectAccountId: string;
  // Reference to the original payment (Stripe checkout session id / Razorpay
  // payment link id). Not always required by the provider API, but useful for
  // reconciliation so we set metadata.bookingId + transfer_group on Stripe.
  providerPaymentId: string;
  bookingId: string;
  // Amount to send to the tenant AFTER our platform fee has been removed.
  amount: Money;
  // Idempotency key so a duplicate cron run can't create a second transfer.
  // Both Stripe and Razorpay honor an Idempotency-Key header.
  idempotencyKey: string;
};

export type ReleaseTransferResult = { transferId: string };

export type RefundInput = {
  providerPaymentId: string;
  // Whole-charge refund when omitted; provider decides currency from the
  // original payment.
  amount?: Money;
  bookingId: string;
  idempotencyKey: string;
};

export type RefundResult = { refundId: string };

export type ReverseTransferInput = {
  transferId: string;
  amount?: Money;
  bookingId: string;
  idempotencyKey: string;
};

export type CreateLinkedAccountInput = {
  tenantId: string;
  businessName: string;
  businessEmail: string;
  // ISO 3166-1 alpha-2 country of the tenant's business.
  country: string;
};

export type CreateLinkedAccountResult = {
  // Provider's account/linked-account id — we persist this on User so later
  // API calls (release, refund, status refresh) know which account to hit.
  accountId: string;
};

export type CreateOnboardingLinkInput = {
  accountId: string;
  // Where the provider sends the user after they finish or dismiss hosted
  // onboarding. Both providers require absolute URLs.
  returnUrl: string;
  refreshUrl: string;
};

export type CreateOnboardingLinkResult = {
  // Hosted onboarding URL — we redirect the tenant to this.
  url: string;
};

export type OnboardingStatus = {
  // True when the provider has cleared the account to charge customers (Stripe
  // charges_enabled / Razorpay Route product activated). This is what we
  // persist to User.<provider>ConnectReady so the checkout flow can gate on it.
  ready: boolean;
  // Provider's own reason string, if surfaced. Shown to the tenant.
  reason?: string;
};

export interface PaymentAdapter {
  readonly provider: PaymentProvider;

  // Create a new linked/connected account for a tenant on the provider. Called
  // once per tenant per provider — the returned accountId is stored on User
  // and reused for every subsequent call. Should be idempotent-safe on the
  // provider side (a duplicate call throws rather than creating a second
  // account); callers guard by checking the DB for an existing accountId.
  createLinkedAccount(input: CreateLinkedAccountInput): Promise<CreateLinkedAccountResult>;

  // Return a hosted-onboarding URL the tenant is redirected to. Regenerated
  // on every call — Stripe account links expire quickly (~a few minutes), so
  // the tenant may click "Complete setup" more than once.
  createOnboardingLink(input: CreateOnboardingLinkInput): Promise<CreateOnboardingLinkResult>;

  // Pull the account's live status from the provider. Called on return from
  // hosted onboarding, and by a manual "refresh" button — updates
  // User.<provider>ConnectReady so the checkout gate reflects reality.
  getOnboardingStatus(accountId: string): Promise<OnboardingStatus>;

  // Build a checkout session on the provider and return the URL to redirect
  // the customer to. Implementations MUST include our bookingId in whatever
  // metadata field the provider passes through to the webhook — we look it
  // up in verifyWebhook() to identify which booking to confirm.
  createCheckout(input: CheckoutInput): Promise<CheckoutResult>;

  // Verify the signature on an incoming webhook and normalize it into our
  // shape. Never trust the request body if this throws or returns "unhandled"
  // for the event type we needed.
  verifyWebhook(input: WebhookVerifyInput): Promise<WebhookEvent>;

  // Move held funds from the platform to the tenant. Called by the release
  // cron 24h after the appointment ends (phase 4.6).
  releaseTransfer(input: ReleaseTransferInput): Promise<ReleaseTransferResult>;

  // Refund the customer from the ORIGINAL payment (works while HELD; after
  // release the money is with the tenant — use reverseTransfer for that).
  refund(input: RefundInput): Promise<RefundResult>;

  // Pull funds back from the tenant's balance to the platform (used for
  // post-release chargebacks / refunds). Stripe: transfer reversal. Razorpay:
  // Route reverse-transfer.
  reverseTransfer(input: ReverseTransferInput): Promise<{ reversalId: string }>;
}

// Convenience: implementations throw this when the adapter is stubbed out so
// callers can distinguish "the interface exists but this phase hasn't wired
// the real API yet" from real provider errors.
export class ProviderNotImplementedError extends Error {
  constructor(provider: PaymentProvider, method: string) {
    super(`${provider}.${method}() is not implemented yet (Feature 4 phase pending).`);
    this.name = "ProviderNotImplementedError";
  }
}
