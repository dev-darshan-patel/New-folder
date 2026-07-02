import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { planConfig } from "@/lib/plans";
import { isFeatureEnabled } from "@/lib/feature-flags";
import EmbedSnippets from "./EmbedSnippets";

export default async function EmbedPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const [canEmbedByPlan, embedEnabled] = await Promise.all([
    Promise.resolve(planConfig(user.plan).customBranding),
    isFeatureEnabled("embed_widget"),
  ]);
  const canEmbed = canEmbedByPlan && embedEnabled;

  const eventTypes = await prisma.eventType.findMany({
    where: { userId: user.id, active: true },
    orderBy: { createdAt: "asc" },
    select: { slug: true, title: true },
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">
        Embed on your website
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        Paste a snippet into your site to let visitors book without leaving it.
      </p>

      {!canEmbed ? (
        <div className="mt-6 flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
          <span>
            {!embedEnabled
              ? "The embeddable widget is temporarily unavailable on the platform."
              : "The embeddable widget is a Pro feature. Upgrade to embed booking on your own site with your branding."}
          </span>
          {embedEnabled && (
            <Link
              href="/dashboard/billing"
              className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 font-medium text-white hover:bg-amber-500"
            >
              Upgrade
            </Link>
          )}
        </div>
      ) : eventTypes.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          Create an event type first, then come back to embed it.
        </p>
      ) : (
        <EmbedSnippets
          appUrl={appUrl}
          slug={user.slug}
          eventTypes={eventTypes}
          brandColor={user.brandColor}
          brandFont={user.brandFont}
        />
      )}
    </div>
  );
}
