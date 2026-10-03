"use client";

import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { ButtonLink } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { ArrowRightIcon } from "@/components/ui/icons";

export function MarketingNavbar() {
  return (
    <header className="relative z-50 w-full">
      <div className="mx-auto flex h-[72px] w-full max-w-[1440px] items-center justify-between gap-6 px-5 sm:h-[80px] sm:px-8 lg:px-10">
        <Link href="/" className="flex shrink-0 items-center" aria-label="ISOBASH home">
          <BrandLogo className="h-8 w-auto sm:h-9 lg:h-10" priority />
        </Link>

        <div className="flex items-center gap-3 sm:gap-4">
          <ThemeToggle />
          {/* `ghost` sets `text-muted-foreground` as a plain text utility, so the
              brand blue needs the important flag to win on source order rather
              than on which rule Tailwind happens to emit last. */}
          <ButtonLink
            href="/login"
            variant="ghost"
            size="sm"
            className="text-[15px] font-medium text-blue-400! hover:text-blue-300! light:text-blue-600! light:hover:text-blue-700!"
          >
            Sign in
          </ButtonLink>
          <ButtonLink
            href="/register"
            size="sm"
            className="group h-11 rounded-full bg-blue-600 px-6 text-[15px] font-medium text-white shadow-[0_14px_36px_-18px_rgba(37,99,235,0.8)] hover:bg-blue-500"
          >
            Get started free
            <ArrowRightIcon className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
          </ButtonLink>
        </div>
      </div>
    </header>
  );
}