import { prisma } from "@/lib/prisma";

const STYLES: Record<string, string> = {
  INFO: "border-indigo-200 bg-indigo-50 text-indigo-800",
  WARNING: "border-amber-200 bg-amber-50 text-amber-800",
  CRITICAL: "border-red-200 bg-red-50 text-red-800",
};

// Platform-wide announcement banners, managed at /admin/announcements.
// Drop into any layout: <AnnouncementBanner />
export default async function AnnouncementBanner() {
  const now = new Date();
  const items = await prisma.announcement.findMany({
    where: { active: true, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    orderBy: { createdAt: "desc" },
  });
  if (items.length === 0) return null;
  return (
    <div className="mb-6 space-y-2">
      {items.map((a) => (
        <div
          key={a.id}
          role="status"
          className={`rounded-lg border px-4 py-2.5 text-sm font-medium ${STYLES[a.level] ?? STYLES.INFO}`}
        >
          {a.message}
        </div>
      ))}
    </div>
  );
}
