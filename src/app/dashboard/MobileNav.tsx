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
} from "lucide-react";
import { logoutAction } from "../(auth)/actions";
import { Button } from "@/components/ui/button";

const navItems = [
  { href: "/dashboard", label: "Overview", Icon: LayoutGrid },
  { href: "/dashboard/event-types", label: "Event Types", Icon: Calendar },
  { href: "/dashboard/availability", label: "Availability", Icon: Clock },
  { href: "/dashboard/bookings", label: "Bookings", Icon: ClipboardList },
  { href: "/dashboard/team", label: "Team", Icon: Users },
  { href: "/dashboard/branding", label: "Branding", Icon: Palette },
  { href: "/dashboard/embed", label: "Embed", Icon: Link2 },
  { href: "/dashboard/billing", label: "Billing", Icon: CreditCard },
  { href: "/dashboard/settings", label: "Settings", Icon: Settings },
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
          Bookify<span className="text-indigo-600">.</span>
        </Link>
        <button
          onClick={() => setOpen(true)}
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
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
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-lg font-bold text-slate-900">
              Bookify<span className="text-indigo-600">.</span>
            </p>
            <p className="truncate text-xs text-slate-500">{businessName}</p>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
            aria-label="Close menu"
          >
            <X size={20} />
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
                  <item.Icon size={18} />
                  {item.label}
                </Link>
              );
            })}
            {isAdmin && (
              <Link
                href="/admin"
                className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-indigo-600 hover:bg-indigo-50"
              >
                <Shield size={18} />
                Admin console
              </Link>
            )}
          </div>
        </nav>

        {/* Logout */}
        <div className="border-t border-slate-200 px-3 py-4">
          <form action={logoutAction}>
            <Button
              type="submit"
              variant="ghost"
              className="w-full justify-start gap-3 rounded-xl px-4 py-3 text-sm font-medium text-slate-500 hover:text-slate-900"
            >
              <LogOut size={18} />
              Log out
            </Button>
          </form>
        </div>
      </div>
    </>
  );
}
