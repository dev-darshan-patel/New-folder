import { cache } from "react";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { resolveSlug } from "@/lib/slug-alias";
import { PRODUCT_NAME } from "@/lib/brand";
import { isPublicBookingAllowed } from "@/lib/platform-config";
import { formatPrice } from "@/lib/payments";
import MaintenanceNotice from "@/components/MaintenanceNotice";
import { Card, CardContent } from "@/components/ui/card";

const getBusiness = cache(async (slug: string) => {
  return prisma.user.findUnique({
    where: { slug },
    include: {
      eventTypes: {
        where: { active: true, unlisted: false },
        orderBy: { createdAt: "asc" },
      },
    },
  });
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const user = await getBusiness(slug);
  if (!user || user.suspended || user.deletedAt) return { title: PRODUCT_NAME };
  return {
    title: `Book with ${user.businessName}`,
    description: `Select a meeting to book with ${user.businessName}.`,
  };
}

export default async function BusinessPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  if (!(await isPublicBookingAllowed())) {
    return <MaintenanceNotice />;
  }

  const { slug } = await params;

  const user = await getBusiness(slug);
  if (!user) {
    // Might be a handle this tenant used to have — send old links to the
    // current one instead of 404ing them. See src/lib/slug-alias.ts.
    const current = await resolveSlug(slug);
    if (current) permanentRedirect(`/${current}`);
    notFound();
  }
  if (user.suspended || user.deletedAt) notFound();

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col px-6 py-16">
      <div className="text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-2xl font-bold text-primary">
          {user.businessName.charAt(0).toUpperCase()}
        </div>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground">
          {user.businessName}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Select a meeting to book.</p>
      </div>

      <ul className="mt-10 space-y-3">
        {user.eventTypes.map((et) => (
          <li key={et.id}>
            <Link href={`/${user.slug}/${et.slug}`}>
              <Card className="transition-shadow hover:shadow-md">
                <CardContent className="p-5">
                  <p className="font-semibold text-foreground">{et.title}</p>
                  {et.description && (
                    <p className="mt-1 text-sm text-slate-600">{et.description}</p>
                  )}
                  <p className="mt-2 text-sm font-medium text-primary">
                    {et.durationMinutes} min
                    {et.priceCents != null && et.currency ? (
                      <span className="ml-2 rounded bg-primary/5 px-2 py-0.5 text-xs">
                        {formatPrice(et.priceCents, et.currency)}
                      </span>
                    ) : null}
                    <span className="ml-1">→</span>
                  </p>
                </CardContent>
              </Card>
            </Link>
          </li>
        ))}
        {user.eventTypes.length === 0 && (
          <li>
            <Card className="border-dashed">
              <CardContent className="p-6 text-center text-sm text-muted-foreground">
                This business has no bookable meetings right now.
              </CardContent>
            </Card>
          </li>
        )}
      </ul>
    </div>
  );
}
