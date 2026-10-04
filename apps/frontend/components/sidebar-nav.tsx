"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
  /** Optional right-aligned annotation: a count, or the word `Admin`. */
  hint?: ReactNode;
};

export type NavGroup = {
  label?: string;
  items: NavItem[];
};

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav({
  items,
  groups,
}: {
  items?: NavItem[];
  groups?: NavGroup[];
}) {
  const pathname = usePathname();
  const sections: NavGroup[] = groups ?? [{ items: items ?? [] }];

  return (
    <nav className="grid gap-5" aria-label="Primary">
      {sections.map((group, index) => (
        <div key={group.label ?? index} className="grid gap-0.5">
          {group.label ? (
            <p className="mb-1.5 px-2.5 font-mono text-[10px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
              {group.label}
            </p>
          ) : null}
          {group.items.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`group relative flex items-center gap-2.5 rounded-lg py-2 pr-2.5 pl-3 text-[13px] transition-colors ${
                  active
                    ? "bg-surface-2 font-medium text-foreground"
                    : "text-muted-foreground hover:bg-surface-2/60 hover:text-foreground"
                }`}
              >
                {/* Left rail marks the active route. */}
                <span
                  aria-hidden="true"
                  className={`absolute top-1/2 -left-0.5 h-4 w-[2px] -translate-y-1/2 rounded-full bg-primary transition-opacity duration-150 ${
                    active ? "opacity-100" : "opacity-0"
                  }`}
                />
                <span
                  className={`shrink-0 transition-colors ${
                    active ? "text-primary" : "text-muted-foreground/70 group-hover:text-foreground"
                  }`}
                >
                  {item.icon}
                </span>
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.hint ? (
                  <span className="shrink-0 font-mono text-[10px] tracking-[0.1em] text-muted-foreground uppercase">
                    {item.hint}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}