import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { resolveBranding } from "@/lib/branding";
import { parseQuestions } from "@/lib/intake";
import { isPublicBookingAllowed } from "@/lib/platform-config";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { formatPrice } from "@/lib/payments";
import MaintenanceNotice from "@/components/MaintenanceNotice";
import BookingWidget from "./BookingWidget";
import GroupBookingWidget from "./GroupBookingWidget";
import EmbedResizer from "@/components/EmbedResizer";

const getEventTypeForBooking = cache(async (slug: string, eventSlug: string) => {
  const user = await prisma.user.findUnique({ where: { slug } });
  if (!user || user.suspended || user.deletedAt) return null;
  const eventType = await prisma.eventType.findUnique({
    where: { userId_slug: { userId: user.id, slug: eventSlug } },
  });
  if (!eventType || !eventType.active) return null;
  return { user, eventType };
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; eventSlug: string }>;
}): Promise<Metadata> {
  const { slug, eventSlug } = await params;
  const found = await getEventTypeForBooking(slug, eventSlug);
  if (!found) return { title: "Booking" };
  return {
    title: `${found.eventType.title} — ${found.user.businessName}`,
    description: `Book a ${found.eventType.durationMinutes}-minute ${found.eventType.title} with ${found.user.businessName}.`,
  };
}

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

  const found = await getEventTypeForBooking(slug, eventSlug);
  if (!found) notFound();
  const { user, eventType } = found;

  // The embed chrome is a platform-wide kill-switchable feature. When the flag
  // is off, an ?embed=1 request degrades to the normal full booking page.
  const embed = sp.embed === "1" && (await isFeatureEnabled("embed_widget"));
  const brand = await resolveBranding(user, {
    color: sp.accent ? `#${sp.accent.replace(/^#/, "")}` : null,
    fontKey: sp.font ?? null,
  });

  return (
    <div
      className={`mx-auto flex w-full max-w-4xl flex-col px-6 ${
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
          {eventType.priceCents != null && eventType.currency && (
            <>
              {" · "}
              <span className="font-medium text-slate-700">
                {formatPrice(eventType.priceCents, eventType.currency)}
              </span>
            </>
          )}
        </p>
        {eventType.description && (
          <p className="mt-3 text-sm text-slate-600">{eventType.description}</p>
        )}
        {brand.welcomeMessage && (
          <p className="mt-2 text-sm text-slate-600">{brand.welcomeMessage}</p>
        )}
      </div>

      {eventType.capacity != null ? (
        <GroupBookingWidget
          eventTypeId={eventType.id}
          timezone={user.timezone}
          accent={brand.color}
          questions={parseQuestions(eventType.intakeQuestions)}
          sessions={await loadUpcomingSessions(eventType.id)}
        />
      ) : (
        <BookingWidget
          eventTypeId={eventType.id}
          timezone={user.timezone}
          accent={brand.color}
          questions={parseQuestions(eventType.intakeQuestions)}
          allowRecurring={eventType.allowRecurring}
          priceLabel={
            eventType.priceCents != null && eventType.currency
              ? formatPrice(eventType.priceCents, eventType.currency)
              : null
          }
        />
      )}
    </div>
  );
}

// Sessions the invitee can still book into: upcoming, not canceled, with at
// least one seat left. Rendered from the server so the initial paint is real.
async function loadUpcomingSessions(eventTypeId: string) {
  const rows = await prisma.session.findMany({
    where: {
      eventTypeId,
      cancelled: false,
      startTime: { gte: new Date() },
    },
    orderBy: { startTime: "asc" },
    select: { id: true, startTime: true, capacity: true, seatsTaken: true },
    take: 50,
  });
  return rows.map((r) => ({
    id: r.id,
    startUtc: r.startTime.toISOString(),
    seatsLeft: Math.max(0, r.capacity - r.seatsTaken),
  }));
}
