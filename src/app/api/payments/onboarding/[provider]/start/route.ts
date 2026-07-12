import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPaymentAdapter } from "@/lib/payments/registry";
import {
  PAYMENT_ACCOUNT_STATUS,
  tenantEligibleProviders,
} from "@/lib/payments";
import type { PaymentProvider } from "@/lib/payments/provider";
import logger from "@/lib/logger";

// Start (or re-start) hosted onboarding for a tenant on the given provider.
// Mirrors the /api/calendar/google/start pattern: a redirect endpoint the
// dashboard links to, which does the provider dance server-side and returns
// a redirect to the provider's hosted URL.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider: providerParam } = await params;
  const settingsUrl = new URL("/dashboard/settings", req.url);

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const provider = providerParam.toUpperCase();
  if (provider !== "STRIPE" && provider !== "RAZORPAY") {
    settingsUrl.searchParams.set("payments", "invalid_provider");
    return NextResponse.redirect(settingsUrl);
  }

  if (user.paymentAccountStatus !== PAYMENT_ACCOUNT_STATUS.APPROVED) {
    settingsUrl.searchParams.set("payments", "not_approved");
    return NextResponse.redirect(settingsUrl);
  }

  const eligible = await tenantEligibleProviders(user.country);
  if (!eligible.includes(provider as PaymentProvider)) {
    settingsUrl.searchParams.set("payments", "provider_ineligible");
    return NextResponse.redirect(settingsUrl);
  }

  const adapter = getPaymentAdapter(provider as PaymentProvider);
  const origin = new URL(req.url).origin;
  const returnUrl = `${origin}/api/payments/onboarding/${provider.toLowerCase()}/return`;
  const refreshUrl = `${origin}/api/payments/onboarding/${provider.toLowerCase()}/start`;

  try {
    // Only create a new provider account if we don't already have one — the
    // hosted onboarding link can be regenerated on the same account many times.
    let accountId =
      provider === "STRIPE" ? user.stripeConnectAccountId : user.razorpayLinkedAccountId;
    if (!accountId) {
      const created = await adapter.createLinkedAccount({
        tenantId: user.id,
        businessName: user.businessName,
        businessEmail: user.email,
        country: user.country ?? "US",
      });
      accountId = created.accountId;
      await prisma.user.update({
        where: { id: user.id },
        data:
          provider === "STRIPE"
            ? { stripeConnectAccountId: accountId }
            : { razorpayLinkedAccountId: accountId },
      });
    }
    const link = await adapter.createOnboardingLink({ accountId, returnUrl, refreshUrl });
    return NextResponse.redirect(link.url);
  } catch (err) {
    logger.error({ err, userId: user.id, provider }, "Payments onboarding start failed");
    settingsUrl.searchParams.set("payments", "onboarding_error");
    return NextResponse.redirect(settingsUrl);
  }
}
