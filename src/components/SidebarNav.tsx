"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isNavActive } from "@/lib/nav-active";
import { cn } from "@/lib/utils";

export type NavGroup = {
  title: string;
  items: { href: string; label: string }[];
};

// The grouped sidebar nav, shared by the tenant dashboard and the admin
// console. Client-side only because it needs the current path to highlight
// where you are — both sidebars previously rendered every link identically,
// so there was no way to tell which page you were on.
export default function SidebarNav({
  groups,
  variant,
}: {
  groups: NavGroup[];
  variant: "light" | "dark";
}) {
  const pathname = usePathname();
  const allHrefs = groups.flatMap((g) => g.items.map((i) => i.href));

  const styles =
    variant === "dark"
      ? {
          groupTitle: "text-muted-foreground",
          link: "text-slate-300 hover:bg-slate-800 hover:text-white",
          active: "bg-slate-800 text-white",
        }
      : {
          groupTitle: "text-slate-400",
          link: "text-slate-600 hover:bg-muted hover:text-foreground",
          active: "bg-muted font-semibold text-foreground",
        };

  return (
    <nav className="mt-8 flex flex-1 flex-col gap-4 overflow-y-auto">
      {groups.map((group) => (
        <div key={group.title}>
          <p
            className={cn(
              "px-3 text-[11px] font-semibold uppercase tracking-wide",
              styles.groupTitle,
            )}
          >
            {group.title}
          </p>
          <div className="mt-1 flex flex-col gap-1">
            {group.items.map((item) => {
              const active = isNavActive(pathname, item.href, allHrefs);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    active ? styles.active : styles.link,
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
