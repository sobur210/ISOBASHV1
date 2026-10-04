"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavGroup, NavItem } from "@/components/sidebar-nav";

/** Horizontal scroller shown below lg, where the sidebar rail is hidden. */
export function MobileNav({
  items,
  groups,
  label,
}: {
  items?: NavItem[];
  groups?: NavGroup[];
  label: string;
}) {
  const pathname = usePathname();
  const flat: NavItem[] = (groups ?? [{ items: items ?? [] }]).flatMap((group) => group.items);

  return (
    <nav
      aria-label={label}
      className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:-mx-6 sm:px-6 lg:hidden"
    >
      {flat.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`inline-flex shrink-0 items-center gap-2 rounded-lg border px-3.5 py-1.5 text-[12.5px] font-medium transition-colors ${
              active
                ? "border-primary/35 bg-primary-soft text-primary"
                : "border-border text-muted-foreground hover:border-border-strong hover:text-foreground"
            }`}
          >
            {item.icon}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}