import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import LogoutButton from "@/components/LogoutButton";
import ImpersonationBanner from "@/components/ImpersonationBanner";
import DeletionBanner from "@/components/DeletionBanner";
import AnnouncementBanner from "@/components/AnnouncementBanner";
import MobileNav from "./MobileNav";
import { Button } from "@/components/ui/button";

// Grouped for scannability, mirroring the /admin sidebar's grouping.
const navGroups: { title: string; items: { href: string; label: string }[] }[] = [
  {
    title: "Scheduling",
    items: [
      { href: "/dashboard", label: "Overview" },
      { href: "/dashboard/event-types", label: "Event Types" },
      { href: "/dashboard/availability", label: "Availability" },
      { href: "/dashboard/bookings", label: "Bookings" },
    ],
  },
  {
    title: "Business",
    items: [
      { href: "/dashboard/team", label: "Team" },
      { href: "/dashboard/branding", label: "Branding" },
      { href: "/dashboard/embed", label: "Embed" },
    ],
  },
  {
    title: "Account",
    items: [
      { href: "/dashboard/billing", label: "Billing" },
      { href: "/dashboard/settings", label: "Settings" },
    ],
  },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // Hard gate: no feature access until the email is verified. OAuth accounts
  // and pre-existing (backfilled) users already have emailVerifiedAt set, so
  // this only stops brand-new, unverified password signups.
  if (!user.emailVerifiedAt) redirect("/verify-email");

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <ImpersonationBanner />
      <DeletionBanner />
      <MobileNav businessName={user.businessName} isAdmin={!!user.adminRole} />
      <div className="flex flex-1">
        <aside className="hidden w-60 flex-col border-r border-slate-200 bg-white p-5 md:flex">
          <Link href="/dashboard" className="text-lg font-bold text-slate-900">
            Bookify<span className="text-indigo-600">.</span>
          </Link>

          {/* User identity strip */}
          <Link
            href="/dashboard/settings"
            className="mt-3 flex items-center gap-2.5 rounded-lg p-1.5 transition-colors hover:bg-slate-50"
            title="Account settings"
          >
            <span className="relative shrink-0 h-8 w-8 overflow-hidden rounded-full border border-slate-200 bg-indigo-100">
              {user.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- user-uploaded blob avatar; next/image adds no value at this fixed 32px size and would need remotePatterns config
                <img
                  src={user.avatarUrl}
                  alt={user.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-xs font-bold text-indigo-600">
                  {user.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                </span>
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-800">{user.name}</span>
              <span className="block truncate text-xs text-slate-500">{user.businessName}</span>
            </span>
          </Link>

          <nav className="mt-8 flex flex-1 flex-col gap-4 overflow-y-auto">
            {navGroups.map((group) => (
              <div key={group.title}>
                <p className="px-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  {group.title}
                </p>
                <div className="mt-1 flex flex-col gap-1">
                  {group.items.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
            {user.adminRole && (
              <Button asChild className="mt-2 w-full justify-start">
                <Link href="/admin">
                  Admin console
                </Link>
              </Button>
            )}
          </nav>

          <a
            href="/PROJECT-GUIDE.html"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            Help & guide ↗
          </a>
          <LogoutButton className="w-full justify-start text-slate-500" />
        </aside>

        <main className="flex-1 px-6 py-8 sm:px-10">
          <AnnouncementBanner />
          {children}
        </main>
      </div>
    </div>
  );
}
