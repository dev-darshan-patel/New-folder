import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getPlanConfig } from "@/lib/plans";
import BrandingForm from "./BrandingForm";

export default async function BrandingPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const canCustomize = (await getPlanConfig(user.plan)).customBranding;

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Branding</h1>
      <p className="mt-1 text-sm text-slate-600">
        Customize how your booking page and embedded widget look.
      </p>

      {!canCustomize && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span>
            Custom branding is a Pro feature. Your changes are saved but use the
            default look until you upgrade.
          </span>
          <Link
            href="/dashboard/billing"
            className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 font-medium text-white hover:bg-amber-500"
          >
            Upgrade
          </Link>
        </div>
      )}

      <BrandingForm
        disabled={false}
        initial={{
          brandColor: user.brandColor,
          brandFont: user.brandFont,
          logoUrl: user.logoUrl ?? "",
          welcomeMessage: user.welcomeMessage ?? "",
          businessName: user.businessName,
        }}
      />
    </div>
  );
}
