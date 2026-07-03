import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { logoutAction } from "../(auth)/actions";
import ImpersonationBanner from "@/components/ImpersonationBanner";
import AnnouncementBanner from "@/components/AnnouncementBanner";
import VerifyEmailBanner from "./VerifyEmailBanner";
import MobileNav from "./MobileNav";
import { Button } from "@/components/ui/button";

const navItems = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/event-types", label: "Event Types" },
  { href: "/dashboard/availability", label: "Availability" },
  { href: "/dashboard/bookings", label: "Bookings" },
  { href: "/dashboard/team", label: "Team" },
  { href: "/dashboard/branding", label: "Branding" },
  { href: "/dashboard/embed", label: "Embed" },
  { href: "/dashboard/billing", label: "Billing" },
  { href: "/dashboard/settings", label: "Settings" },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <ImpersonationBanner />
      {!user.emailVerifiedAt && <VerifyEmailBanner />}
      <MobileNav businessName={user.businessName} isAdmin={!!user.adminRole} />
      <div className="flex flex-1">
        <aside className="hidden w-60 flex-col border-r border-slate-200 bg-white p-5 md:flex">
          <Link href="/dashboard" className="text-lg font-bold text-slate-900">
            Booking<span className="text-indigo-600">.</span>
          </Link>
          <p className="mt-1 truncate text-xs text-slate-500">{user.businessName}</p>

          <nav className="mt-8 flex flex-1 flex-col gap-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
              >
                {item.label}
              </Link>
            ))}
            {user.adminRole && (
              <Button asChild className="mt-2 w-full justify-start">
                <Link href="/admin">
                  Admin console
                </Link>
              </Button>
            )}
          </nav>

          <form action={logoutAction}>
            <Button
              type="submit"
              variant="ghost"
              className="w-full justify-start text-slate-500"
            >
              Log out
            </Button>
          </form>
        </aside>

        <main className="flex-1 px-6 py-8 sm:px-10">
          <AnnouncementBanner />
          {children}
        </main>
      </div>
    </div>
  );
}
