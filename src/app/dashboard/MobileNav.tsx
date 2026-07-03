"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "../(auth)/actions";

const navItems = [
  { href: "/dashboard", label: "Overview", icon: "⊞" },
  { href: "/dashboard/event-types", label: "Event Types", icon: "📅" },
  { href: "/dashboard/availability", label: "Availability", icon: "🕐" },
  { href: "/dashboard/bookings", label: "Bookings", icon: "📋" },
  { href: "/dashboard/team", label: "Team", icon: "👥" },
  { href: "/dashboard/branding", label: "Branding", icon: "🎨" },
  { href: "/dashboard/embed", label: "Embed", icon: "🔗" },
  { href: "/dashboard/billing", label: "Billing", icon: "💳" },
  { href: "/dashboard/settings", label: "Settings", icon: "⚙️" },
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

  // Close drawer on route change
  useEffect(() => {
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
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden">
        <Link href="/dashboard" className="text-lg font-bold text-slate-900">
          Booking<span className="text-indigo-600">.</span>
        </Link>
        <button
          onClick={() => setOpen(true)}
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
          aria-label="Open menu"
        >
          <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6" x2="19" y2="6" />
            <line x1="3" y1="11" x2="19" y2="11" />
            <line x1="3" y1="16" x2="19" y2="16" />
          </svg>
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
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-lg font-bold text-slate-900">
              Booking<span className="text-indigo-600">.</span>
            </p>
            <p className="truncate text-xs text-slate-500">{businessName}</p>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
            aria-label="Close menu"
          >
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="4" y1="4" x2="16" y2="16" />
              <line x1="16" y1="4" x2="4" y2="16" />
            </svg>
          </button>
        </div>

        {/* Nav links */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <div className="space-y-1">
            {navItems.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors ${
                    active
                      ? "bg-indigo-50 text-indigo-700"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  <span className="text-base">{item.icon}</span>
                  {item.label}
                </Link>
              );
            })}
            {isAdmin && (
              <Link
                href="/admin"
                className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-indigo-600 hover:bg-indigo-50"
              >
                <span className="text-base">🛡️</span>
                Admin console
              </Link>
            )}
          </div>
        </nav>

        {/* Logout */}
        <div className="border-t border-slate-200 px-3 py-4">
          <form action={logoutAction}>
            <button
              type="submit"
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            >
              <span className="text-base">🚪</span>
              Log out
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
