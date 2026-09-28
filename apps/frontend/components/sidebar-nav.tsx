"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
};

export function SidebarNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="grid gap-0.5" aria-label="Primary">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-200 ${
              active
                ? "bg-primary-soft font-medium text-foreground"
                : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
            }`}
          >
            {/* Left rail marks the active route. */}
            <span
              aria-hidden="true"
              className={`absolute top-1/2 -left-2 h-5 w-[2.5px] -translate-y-1/2 rounded-full bg-primary transition-all duration-200 ${
                active ? "opacity-100" : "scale-y-0 opacity-0 group-hover:scale-y-50 group-hover:opacity-40"
              }`}
            />
            <span className={active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}>
              {item.icon}
            </span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
