import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPaymentAdapter } from "@/lib/payments/registry";
import type { PaymentProvider } from "@/lib/payments/provider";
import logger from "@/lib/logger";

// Where Stripe/Razorpay redirect the tenant after hosted onboarding. We
// re-fetch the account's status from the provider and stamp the "ready"
// flag on User so the checkout gate can rely on it. Failures here never
// leave the user stranded — worst case the settings page shows a "still
// pending" and offers a manual refresh.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider: providerParam } = await params;
  const settingsUrl = new URL("/dashboard/settings", req.url);

  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const provider = providerParam.toUpperCase();
  if (provider !== "STRIPE" && provider !== "RAZORPAY") {
    settingsUrl.searchParams.set("payments", "invalid_provider");
    return NextResponse.redirect(settingsUrl);
  }

  const accountId =
    provider === "STRIPE" ? user.stripeConnectAccountId : user.razorpayLinkedAccountId;
  if (!accountId) {
    // The tenant hit the return URL without ever starting onboarding, or
    // their account row was cleared. Sending them back to settings with a
    // "start over" cue is fine — nothing to reconcile.
    settingsUrl.searchParams.set("payments", "not_started");
    return NextResponse.redirect(settingsUrl);
  }

  try {
    const adapter = getPaymentAdapter(provider as PaymentProvider);
    const status = await adapter.getOnboardingStatus(accountId);
    await prisma.user.update({
      where: { id: user.id },
      data:
        provider === "STRIPE"
          ? { stripeConnectReady: status.ready }
          : { razorpayConnectReady: status.ready },
    });
    settingsUrl.searchParams.set("payments", status.ready ? "ready" : "pending");
  } catch (err) {
    logger.error({ err, userId: user.id, provider }, "Payments onboarding return failed");
    settingsUrl.searchParams.set("payments", "status_error");
  }

  return NextResponse.redirect(settingsUrl);
}
