import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { resolveBranding } from "@/lib/branding";
import { parseQuestions } from "@/lib/intake";
import { isPublicBookingAllowed } from "@/lib/platform-config";
import { isFeatureEnabled } from "@/lib/feature-flags";
import MaintenanceNotice from "@/components/MaintenanceNotice";
import BookingWidget from "./BookingWidget";
import EmbedResizer from "@/components/EmbedResizer";

export default async function BookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; eventSlug: string }>;
  searchParams: Promise<{ embed?: string; accent?: string; font?: string }>;
}) {
  if (!(await isPublicBookingAllowed())) {
    return <MaintenanceNotice />;
  }

  const { slug, eventSlug } = await params;
  const sp = await searchParams;

  const user = await prisma.user.findUnique({ where: { slug } });
  if (!user || user.suspended || user.deletedAt) notFound();

  const eventType = await prisma.eventType.findUnique({
    where: { userId_slug: { userId: user.id, slug: eventSlug } },
  });
  if (!eventType || !eventType.active) notFound();

  // The embed chrome is a platform-wide kill-switchable feature. When the flag
  // is off, an ?embed=1 request degrades to the normal full booking page.
  const embed = sp.embed === "1" && (await isFeatureEnabled("embed_widget"));
  const brand = await resolveBranding(user, {
    color: sp.accent ? `#${sp.accent.replace(/^#/, "")}` : null,
    fontKey: sp.font ?? null,
  });

  return (
    <div
      className={`mx-auto flex w-full max-w-2xl flex-col px-6 ${
        embed ? "py-6" : "min-h-screen py-12"
      }`}
      style={{ fontFamily: brand.fontStack }}
    >
      {brand.googleFontHref && (
        <link rel="stylesheet" href={brand.googleFontHref} />
      )}
      {embed && <EmbedResizer />}

      <div className="border-b border-slate-200 pb-6">
        {brand.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={brand.logoUrl}
            alt={user.businessName}
            className="mb-3 h-10 w-auto object-contain"
          />
        ) : null}
        <p className="text-sm font-medium" style={{ color: brand.color }}>
          {user.businessName}
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
          {eventType.title}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {eventType.durationMinutes} min
        </p>
        {eventType.description && (
          <p className="mt-3 text-sm text-slate-600">{eventType.description}</p>
        )}
        {brand.welcomeMessage && (
          <p className="mt-2 text-sm text-slate-600">{brand.welcomeMessage}</p>
        )}
      </div>

      <BookingWidget
        eventTypeId={eventType.id}
        timezone={user.timezone}
        accent={brand.color}
        questions={parseQuestions(eventType.intakeQuestions)}
      />
    </div>
  );
}
