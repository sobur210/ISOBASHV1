"use client";

import { useState } from "react";
import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { CloseIcon, MenuIcon } from "@/components/marketing/marketing-icons";

const links = [
  { label: "Home", href: "/" },
  { label: "Features", href: "/#features" },
  { label: "Pricing", href: "/app/billing" },
  { label: "Blog", href: "/blog" },
  { label: "About", href: "/about" },
];

export function MarketingNavbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/[0.06] bg-[#070B14]/90 backdrop-blur-xl">
      <div className="mx-auto flex h-[72px] w-full max-w-7xl items-center justify-between gap-6 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <BrandLogo className="h-7 w-auto brightness-0 invert" priority />
          <span className="font-mono text-[15px] font-bold tracking-[0.28em] text-white">ISOBASH</span>
        </Link>

        <nav className="hidden items-center gap-8 lg:flex">
          {links.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="text-[13.5px] font-medium text-slate-400 transition-colors hover:text-white"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <Link
            href="/login"
            className="rounded-full px-4 py-2 text-[13.5px] font-medium text-slate-300 transition-colors hover:text-white"
          >
            Sign In
          </Link>
          <Link
            href="/register"
            className="rounded-full bg-[#3B82F6] px-5 py-2.5 text-[13.5px] font-semibold text-white shadow-[0_8px_24px_rgba(59,130,246,0.35)] transition-colors hover:bg-[#2563EB]"
          >
            Get Started Free
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="marketing-mobile-nav"
          aria-label={open ? "Close menu" : "Open menu"}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 text-slate-200 lg:hidden"
        >
          {open ? <CloseIcon className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
        </button>
      </div>

      {open ? (
        <div id="marketing-mobile-nav" className="border-t border-white/[0.06] bg-[#070B14] lg:hidden">
          <nav className="mx-auto flex w-full max-w-7xl flex-col gap-1 px-4 py-4 sm:px-6">
            {links.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
              >
                {link.label}
              </Link>
            ))}
            <div className="mt-3 flex flex-col gap-2">
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className="rounded-full border border-white/12 px-5 py-2.5 text-center text-sm font-medium text-slate-200"
              >
                Sign In
              </Link>
              <Link
                href="/register"
                onClick={() => setOpen(false)}
                className="rounded-full bg-[#3B82F6] px-5 py-2.5 text-center text-sm font-semibold text-white"
              >
                Get Started Free
              </Link>
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
