import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { MobileNav } from "@/components/mobile-nav";
import { SidebarNav } from "@/components/sidebar-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { SignOutButton } from "@/components/sign-out-button";
import { requireAdmin } from "@/lib/auth-server";
import {
  ChartIcon,
  GridIcon,
  HomeIcon,
  SettingsIcon,
  ShieldIcon,
  UsersIcon,
} from "@/components/ui/icons";

const adminNav = [
  { href: "/admin", label: "Overview", icon: <HomeIcon className="h-4 w-4" /> },
  { href: "/admin/users", label: "Users", icon: <UsersIcon className="h-4 w-4" /> },
  { href: "/admin/analytics", label: "Analytics", icon: <ChartIcon className="h-4 w-4" /> },
  { href: "/admin/settings", label: "System settings", icon: <SettingsIcon className="h-4 w-4" /> },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();
  const identity = user.name ?? user.email;
  const initials = identity.trim().charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link href="/" className="inline-flex items-center gap-2.5" aria-label="ISOBASH home">
            <BrandLogo className="h-6 w-auto" priority />
            <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent-soft px-2.5 py-1 font-mono text-[10px] font-medium tracking-[0.14em] text-accent uppercase">
              <ShieldIcon className="h-3 w-3" />
              Admin
            </span>
          </Link>

          <div className="flex items-center gap-2">
            <Link
              href="/app"
              className="hidden items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3.5 py-2 text-[12.5px] text-muted-foreground transition-all hover:border-border-strong hover:text-foreground sm:inline-flex"
            >
              <GridIcon className="h-3.5 w-3.5" />
              Back to workspace
            </Link>

            <span
              title={identity}
              className="hidden max-w-56 items-center gap-2.5 rounded-full border border-border bg-surface-2 py-1 pr-3.5 pl-1 text-[12.5px] text-muted-foreground sm:inline-flex"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft font-mono text-[11px] font-semibold text-accent">
                {initials}
              </span>
              <span className="truncate">{identity}</span>
            </span>

            <ThemeToggle />
            <SignOutButton />
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[224px_1fr] lg:px-8 lg:py-10">
        <div className="hidden lg:block">
          <div className="sticky top-24">
            <p className="mb-4 px-3 font-mono text-[10px] font-medium tracking-[0.24em] text-accent uppercase">
              Control center
            </p>
            <SidebarNav items={adminNav} />
          </div>
        </div>

        <MobileNav items={adminNav} label="Admin" />

        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
