import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { RegisterForm } from "@/components/register-form";

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
        <RegisterForm />
      </main>
    </div>
  );
}