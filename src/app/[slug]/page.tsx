import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { isPublicBookingAllowed } from "@/lib/platform-config";
import MaintenanceNotice from "@/components/MaintenanceNotice";
import { Card, CardContent } from "@/components/ui/card";

export default async function BusinessPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  if (!(await isPublicBookingAllowed())) {
    return <MaintenanceNotice />;
  }

  const { slug } = await params;

  const user = await prisma.user.findUnique({
    where: { slug },
    include: {
      eventTypes: {
        where: { active: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!user || user.suspended || user.deletedAt) notFound();

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col px-6 py-16">
      <div className="text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-indigo-100 text-2xl font-bold text-indigo-700">
          {user.businessName.charAt(0).toUpperCase()}
        </div>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">
          {user.businessName}
        </h1>
        <p className="mt-1 text-sm text-slate-500">Select a meeting to book.</p>
      </div>

      <ul className="mt-10 space-y-3">
        {user.eventTypes.map((et) => (
          <li key={et.id}>
            <Link href={`/${user.slug}/${et.slug}`}>
              <Card className="transition-shadow hover:shadow-md">
                <CardContent className="p-5">
                  <p className="font-semibold text-slate-900">{et.title}</p>
                  {et.description && (
                    <p className="mt-1 text-sm text-slate-600">{et.description}</p>
                  )}
                  <p className="mt-2 text-sm font-medium text-indigo-600">
                    {et.durationMinutes} min →
                  </p>
                </CardContent>
              </Card>
            </Link>
          </li>
        ))}
        {user.eventTypes.length === 0 && (
          <li>
            <Card className="border-dashed">
              <CardContent className="p-6 text-center text-sm text-slate-500">
                This business has no bookable meetings right now.
              </CardContent>
            </Card>
          </li>
        )}
      </ul>
    </div>
  );
}
