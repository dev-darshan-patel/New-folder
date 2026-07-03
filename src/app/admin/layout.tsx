import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { logoutAction } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";

const navItems = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/bookings", label: "Bookings" },
  { href: "/admin/billing", label: "Billing" },
  { href: "/admin/coupons", label: "Coupons" },
  { href: "/admin/announcements", label: "Announcements" },
  { href: "/admin/broadcast", label: "Broadcast" },
  { href: "/admin/audit", label: "Audit log" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  // Hide the admin area entirely from non-admins (404 rather than reveal it).
  if (!user || !user.adminRole) notFound();

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="hidden w-60 flex-col border-r border-slate-200 bg-slate-900 p-5 text-slate-100 md:flex">
        <Link href="/admin" className="text-lg font-bold">
          Admin<span className="text-indigo-400">.</span>
        </Link>
        <p className="mt-1 text-xs text-slate-400">
          Platform console · {user.adminRole.replace("_", " ").toLowerCase()}
        </p>

        <nav className="mt-8 flex flex-1 flex-col gap-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
            >
              {item.label}
            </Link>
          ))}
          {user.adminRole === "SUPER_ADMIN" && (
            <>
              <Link
                href="/admin/settings"
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
              >
                Billing settings
              </Link>
              <Link
                href="/admin/settings/auth"
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
              >
                Sign-in providers
              </Link>
              <Link
                href="/admin/settings/platform"
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
              >
                Platform config
              </Link>
              <Link
                href="/admin/settings/flags"
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
              >
                Feature flags
              </Link>
              <Link
                href="/admin/settings/email"
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
              >
                Email settings
              </Link>
              <Link
                href="/admin/settings/email-templates"
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
              >
                Email templates
              </Link>
            </>
          )}
        </nav>

        <Link
          href="/dashboard"
          className="rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
        >
          ← Back to app
        </Link>
        <form action={logoutAction} className="mt-1">
          <Button
            type="submit"
            variant="ghost"
            className="w-full justify-start text-slate-500 hover:bg-slate-800 hover:text-white"
          >
            Log out
          </Button>
        </form>
      </aside>

      <main className="flex-1 px-6 py-8 sm:px-10">{children}</main>
    </div>
  );
}
