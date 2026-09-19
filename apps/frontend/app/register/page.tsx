import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { CpuIcon } from "@/components/ui/icons";

export default function RegisterPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5 font-mono text-sm font-bold tracking-[0.22em] text-primary">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">I</span>
            ISOBASH
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="w-full max-w-md">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-accent">ISOBASH access</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.02em] text-foreground">Create account</h1>
          <p className="mt-4 leading-7 text-muted-foreground">
            Registration will use server-side validation, password hashing, sessions, and role assignment before any
            account becomes active.
          </p>
          <div className="mt-8 rounded-2xl border border-border bg-surface p-6">
            <div className="flex gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                <CpuIcon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Registration is under construction</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  This page intentionally does not pretend to succeed while the authentication service is being built.
                </p>
              </div>
            </div>
          </div>
          <div className="mt-6 flex gap-3">
            <ButtonLink href="/" variant="outline" className="flex-1">
              Back to home
            </ButtonLink>
            <ButtonLink href="/login" variant="ghost" className="flex-1">
              Sign in
            </ButtonLink>
          </div>
        </div>
      </main>
    </div>
  );
}