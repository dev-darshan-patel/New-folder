"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Menu,
  X,
  LayoutGrid,
  Calendar,
  Clock,
  ClipboardList,
  Users,
  Palette,
  Link2,
  CreditCard,
  Settings,
  Shield,
  LogOut,
  HelpCircle,
} from "lucide-react";
import { logoutAction } from "../(auth)/actions";
import { isNavActive } from "@/lib/nav-active";
import { SubmitButton } from "@/components/ui/submit-button";

// Grouped to match the desktop sidebar (src/app/dashboard/layout.tsx).
const navGroups = [
  {
    title: "Scheduling",
    items: [
      { href: "/dashboard", label: "Overview", Icon: LayoutGrid },
      { href: "/dashboard/event-types", label: "Event Types", Icon: Calendar },
      { href: "/dashboard/availability", label: "Availability", Icon: Clock },
      { href: "/dashboard/bookings", label: "Bookings", Icon: ClipboardList },
    ],
  },
  {
    title: "Business",
    items: [
      { href: "/dashboard/team", label: "Team", Icon: Users },
      { href: "/dashboard/branding", label: "Branding", Icon: Palette },
      { href: "/dashboard/embed", label: "Embed", Icon: Link2 },
    ],
  },
  {
    title: "Account",
    items: [
      { href: "/dashboard/billing", label: "Billing", Icon: CreditCard },
      { href: "/dashboard/settings", label: "Settings", Icon: Settings },
    ],
  },
];

export default function MobileNav({
  businessName,
  isAdmin,
}: {
  businessName: string;
  isAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const allHrefs = navGroups.flatMap((g) => g.items.map((i) => i.href));

  // Close drawer on route change. Syncing the drawer to router navigation is a
  // legitimate effect, not the derived-state anti-pattern the rule targets.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(false);
  }, [pathname]);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      {/* Mobile top bar */}
      <header className="flex items-center justify-between border-b border-border bg-white px-4 py-3 md:hidden">
        <Link href="/dashboard" className="text-lg font-bold text-foreground">
          Bookify<span className="text-primary">.</span>
        </Link>
        <button
          onClick={() => setOpen(true)}
          className="rounded-lg p-2 text-slate-600 hover:bg-muted"
          aria-label="Open menu"
        >
          <Menu size={22} />
        </button>
      </header>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Slide-out drawer */}
      <div
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-white shadow-xl transition-transform duration-300 md:hidden ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <p className="text-lg font-bold text-foreground">
              Bookify<span className="text-primary">.</span>
            </p>
            <p className="truncate text-xs text-muted-foreground">{businessName}</p>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="rounded-lg p-2 text-slate-400 hover:bg-muted"
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>

        {/* Nav links */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <div className="space-y-4">
            {navGroups.map((group) => (
              <div key={group.title}>
                <p className="px-4 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  {group.title}
                </p>
                <div className="mt-1 space-y-1">
                  {group.items.map((item) => {
                    const active = isNavActive(pathname, item.href, allHrefs);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors ${
                          active
                            ? "bg-indigo-50 text-indigo-700"
                            : "text-slate-600 hover:bg-muted hover:text-foreground"
                        }`}
                      >
                        <item.Icon size={18} />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
            {isAdmin && (
              <Link
                href="/admin"
                className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-primary hover:bg-indigo-50"
              >
                <Shield size={18} />
                Admin console
              </Link>
            )}
            <a
              href="/PROJECT-GUIDE.html"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <HelpCircle size={18} />
              Help & guide
            </a>
          </div>
        </nav>

        {/* Logout */}
        <div className="border-t border-border px-3 py-4">
          <form action={logoutAction}>
            <SubmitButton
              variant="ghost"
              className="w-full justify-start gap-3 rounded-xl px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              <LogOut size={18} />
              Log out
            </SubmitButton>
          </form>
        </div>
      </div>
    </>
  );
}
