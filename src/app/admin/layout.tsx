import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import LogoutButton from "@/components/LogoutButton";

// Grouped for scannability — a flat list of 16 identical-looking links made
// it hard to find anything. superAdminOnly items are filtered per-role below,
// same gating as before, just organized instead of appended as one block.
const navGroups: { title: string; items: { href: string; label: string; superAdminOnly?: boolean }[] }[] = [
  {
    title: "Operations",
    items: [
      { href: "/admin", label: "Overview" },
      { href: "/admin/users", label: "Users" },
      { href: "/admin/bookings", label: "Bookings" },
    ],
  },
  {
    title: "Revenue",
    items: [
      { href: "/admin/billing", label: "Billing" },
      { href: "/admin/payments", label: "Payments" },
      { href: "/admin/coupons", label: "Coupons" },
    ],
  },
  {
    title: "Communications",
    items: [
      { href: "/admin/announcements", label: "Announcements" },
      { href: "/admin/broadcast", label: "Broadcast" },
      { href: "/admin/settings/email", label: "Email settings", superAdminOnly: true },
      { href: "/admin/settings/email-templates", label: "Email templates", superAdminOnly: true },
    ],
  },
  {
    title: "Platform setup",
    items: [
      { href: "/admin/settings", label: "Billing settings", superAdminOnly: true },
      { href: "/admin/settings/auth", label: "Sign-in providers", superAdminOnly: true },
      { href: "/admin/settings/platform", label: "Platform config", superAdminOnly: true },
      { href: "/admin/settings/plans", label: "Plans", superAdminOnly: true },
      { href: "/admin/settings/flags", label: "Feature flags", superAdminOnly: true },
    ],
  },
  {
    title: "Compliance",
    items: [{ href: "/admin/audit", label: "Audit log" }],
  },
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

        <nav className="mt-8 flex flex-1 flex-col gap-4 overflow-y-auto">
          {navGroups.map((group) => {
            const items = group.items.filter(
              (item) => !item.superAdminOnly || user.adminRole === "SUPER_ADMIN",
            );
            if (items.length === 0) return null;
            return (
              <div key={group.title}>
                <p className="px-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {group.title}
                </p>
                <div className="mt-1 flex flex-col gap-1">
                  {items.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        <a
          href="/PROJECT-GUIDE.html"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
        >
          Docs / guide ↗
        </a>

        <Link
          href="/dashboard"
          className="rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
        >
          ← Back to app
        </Link>
        <div className="mt-1">
          <LogoutButton className="w-full justify-start text-slate-500 hover:bg-slate-800 hover:text-white" />
        </div>
      </aside>

      <main className="flex-1 px-6 py-8 sm:px-10">{children}</main>
    </div>
  );
}
