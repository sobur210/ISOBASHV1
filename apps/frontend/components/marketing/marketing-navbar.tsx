"use client";

import { useState } from "react";
import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { ButtonLink } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { ArrowRightIcon, MenuIcon, CloseIcon } from "@/components/ui/icons";

const navItems = [
  { label: "Home", href: "/" },
  { label: "Features", href: "/#features" },
  { label: "Agents", href: "/app/agents" },
  { label: "Pricing", href: "/app/billing" },
  { label: "Docs", href: "/blog" },
];

export function MarketingNavbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="relative z-50 w-full">
      <div className="mx-auto flex h-[72px] w-full max-w-[1440px] items-center justify-between gap-6 px-5 sm:h-[80px] sm:px-8 lg:px-10">
        <Link href="/" className="flex shrink-0 items-center" aria-label="ISOBASH home">
          <BrandLogo className="h-8 w-auto sm:h-9 lg:h-10" priority />
        </Link>

        <nav className="hidden items-center gap-9 lg:flex" aria-label="Primary">
          {navItems.map((item) => {
            const isActive = item.href === "/";
            return (
              <Link
                key={item.label}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`group relative py-1 text-[15px] transition-colors duration-200 ${
                  isActive
                    ? "font-semibold text-foreground"
                    : "font-medium text-muted-foreground hover:text-foreground"
                }`}
              >
                {item.label}
                <span
                  className={`absolute inset-x-0 -bottom-0.5 h-px origin-center bg-primary transition-transform duration-300 ${
                    isActive ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100"
                  }`}
                />
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3 sm:gap-4">
          <ThemeToggle />
          <ButtonLink
            href="/login"
            variant="ghost"
            size="sm"
            /* `ghost` sets `text-muted-foreground` as a plain text utility, so the brand
 * blue needs the important flag to win on source order rather than on which
 * rule Tailwind happens to emit last. */
className="hidden text-[15px] font-medium text-blue-400! hover:text-blue-300! light:text-blue-600! light:hover:text-blue-700! sm:inline-flex"
          >
            Sign in
          </ButtonLink>
          <ButtonLink
            href="/register"
            size="sm"
            className="group hidden h-11 rounded-full bg-blue-600 px-6 text-[15px] font-medium text-white shadow-[0_14px_36px_-18px_rgba(37,99,235,0.8)] hover:bg-blue-500 sm:inline-flex"
          >
            Get started free
            <ArrowRightIcon className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
          </ButtonLink>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
            className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-border bg-surface-2 text-foreground transition-colors hover:border-primary/40 hover:text-primary lg:hidden"
          >
            {open ? <CloseIcon className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open ? (
        <div className="px-5 pb-5 lg:hidden">
          <nav
            aria-label="Primary mobile"
            className="glass flex flex-col gap-1 rounded-3xl p-3 shadow-lift"
          >
            {navItems.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-2xl px-4 py-3 text-[15px] font-medium text-muted-foreground transition-colors hover:bg-primary-soft hover:text-primary"
              >
                {item.label}
              </Link>
            ))}
            <div className="mt-1 flex flex-col gap-2 border-t border-border pt-3">
              <ButtonLink
                href="/login"
                variant="subtle"
                size="md"
                className="w-full text-blue-400! light:text-blue-600!"
              >
                Sign in
              </ButtonLink>
              <ButtonLink href="/register" size="md" className="w-full">
                Get started free
                <ArrowRightIcon className="h-4 w-4" />
              </ButtonLink>
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}