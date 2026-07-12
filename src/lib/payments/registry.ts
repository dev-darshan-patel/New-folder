import "server-only";
import { stripeAdapter } from "./stripe-adapter";
import { razorpayAdapter } from "./razorpay-adapter";
import type { PaymentAdapter, PaymentProvider } from "./provider";

// Central lookup so every consumer of an adapter does the same thing. Never
// import a specific adapter directly outside of this file — that would fork
// the seam we're building here.
export function getPaymentAdapter(provider: PaymentProvider): PaymentAdapter {
  switch (provider) {
    case "STRIPE":
      return stripeAdapter;
    case "RAZORPAY":
      return razorpayAdapter;
    default: {
      const exhaustive: never = provider;
      throw new Error(`Unknown payment provider: ${exhaustive}`);
    }
  }
}
