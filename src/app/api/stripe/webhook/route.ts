import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getStripe, getActiveStripeConfig, getPlanForStripePrice } from "@/lib/stripe";

// Stripe webhooks need the raw request body for signature verification.
export async function POST(req: NextRequest) {
  const stripe = await getStripe();
  const { webhookSecret: secret } = await getActiveStripeConfig();
  if (!stripe || !secret) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }

  const body = await req.text();
  const signature = req.headers.get("stripe-signature") || "";

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, secret);
  } catch (err) {
    console.error("Webhook signature verification failed", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub =
          event.type === "checkout.session.completed"
            ? await stripe.subscriptions.retrieve(
                String(
                  (event.data.object as Stripe.Checkout.Session).subscription,
                ),
              )
            : (event.data.object as Stripe.Subscription);
        await syncSubscription(sub);
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await prisma.user.updateMany({
          where: { stripeCustomerId: String(sub.customer) },
          data: {
            plan: "FREE",
            stripeSubscriptionId: null,
            subscriptionStatus: "canceled",
            planRenewsAt: null,
          },
        });
        break;
      }
    }
  } catch (err) {
    console.error("Webhook handler error", err);
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function syncSubscription(sub: Stripe.Subscription) {
  const priceId = sub.items.data[0]?.price.id;
  const plan = priceId ? await getPlanForStripePrice(priceId) : null;
  const periodEnd = sub.items.data[0]?.current_period_end;

  await prisma.user.updateMany({
    where: { stripeCustomerId: String(sub.customer) },
    data: {
      ...(plan ? { plan } : {}),
      stripeSubscriptionId: sub.id,
      subscriptionStatus: sub.status,
      planRenewsAt: periodEnd ? new Date(periodEnd * 1000) : null,
    },
  });
}
