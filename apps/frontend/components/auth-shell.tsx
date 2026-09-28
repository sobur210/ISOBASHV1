import Link from "next/link";
import type { ReactNode } from "react";
import { AuroraBackdrop } from "@/components/marketing/aurora-backdrop";
import { BrandLogo } from "@/components/brand-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { CheckIcon, LockIcon } from "@/components/ui/icons";

const assurances = [
  "Server-side sessions in an httpOnly cookie",
  "bcrypt password hashing, never stored in plain text",
  "TOTP two-factor authentication available on any account",
];

export function AuthShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel — collapses away below lg. */}
      <aside className="relative isolate hidden overflow-hidden border-r border-border lg:flex lg:flex-col lg:justify-between">
        <AuroraBackdrop />

        <Link href="/" className="relative inline-flex items-center self-start p-10" aria-label="ISOBASH home">
          <BrandLogo className="h-7 w-auto" priority />
        </Link>

        <div className="relative px-10 pb-4">
          <h2 className="max-w-md text-[2.5rem] leading-[1.05] font-bold tracking-[-0.04em] text-balance">
            <span className="text-foreground">One workspace.</span>
            <span className="text-gradient mt-1.5 block">Every model you trust.</span>
          </h2>
          <ul className="mt-8 space-y-3">
            {assurances.map((item) => (
              <li key={item} className="flex items-start gap-3 text-[13.5px] text-muted-foreground">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-success/30 bg-success/10 text-success">
                  <CheckIcon className="h-3 w-3" />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative flex items-center gap-2 px-10 pb-10 font-mono text-[10.5px] tracking-[0.2em] text-muted-foreground/70 uppercase">
          <LockIcon className="h-3.5 w-3.5" />
          Local-first · Cloud-ready
        </p>
      </aside>

      {/* Form panel */}
      <div className="relative flex flex-col">
        <header className="flex items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <Link href="/" className="inline-flex items-center lg:hidden" aria-label="ISOBASH home">
            <BrandLogo className="h-6 w-auto" priority />
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
          </div>
        </header>

        <main className="flex flex-1 items-center justify-center px-5 py-8 sm:px-8 sm:py-12">
          <div className="w-full max-w-[26rem]">
            <p className="font-mono text-[10.5px] font-semibold tracking-[0.24em] text-primary uppercase">
              ISOBASH access
            </p>
            <h1 className="mt-4 text-[2.1rem] leading-[1.1] font-bold tracking-[-0.035em] text-balance sm:text-[2.4rem]">
              {title}
            </h1>
            <p className="mt-4 text-[14.5px] leading-7 text-muted-foreground">{description}</p>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
