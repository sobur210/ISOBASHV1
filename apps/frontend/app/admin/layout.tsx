import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { MobileNav } from "@/components/mobile-nav";
import { SidebarNav } from "@/components/sidebar-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { SignOutButton } from "@/components/sign-out-button";
import { requireAdmin } from "@/lib/auth-server";
import type { NavGroup } from "@/components/sidebar-nav";
import { ActivityIcon, ChartIcon, ServerIcon, ShieldIcon, UsersIcon } from "@/components/ui/icons";

/**
 * The console is one frame with three registers: a quiet identity bar, a grouped
 * rail, and the page itself. Sections are named for what an administrator does
 * (watch the deployment, then act on the people in it) rather than for the code
 * that serves them.
 */
const adminNav: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { href: "/admin", label: "Control center", icon: <ActivityIcon className="h-4 w-4" /> },
      { href: "/admin/analytics", label: "Analytics", icon: <ChartIcon className="h-4 w-4" /> },
    ],
  },
  {
    label: "Manage",
    items: [
      { href: "/admin/users", label: "Users", icon: <UsersIcon className="h-4 w-4" /> },
      { href: "/admin/settings", label: "Configuration", icon: <ServerIcon className="h-4 w-4" /> },
    ],
  },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();
  const identity = user.name ?? user.email;
  const initials = identity.trim().charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-full max-w-[1400px] items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/admin" className="inline-flex shrink-0 items-center" aria-label="ISOBASH admin">
              <BrandLogo className="h-5 w-auto" priority />
            </Link>
            <span
              className="hidden items-center gap-1.5 rounded-md border border-accent/30 bg-accent-soft px-2 py-1 font-mono text-[10px] font-medium tracking-[0.14em] text-accent uppercase sm:inline-flex"
            >
              <ShieldIcon className="h-3 w-3" />
              Admin
            </span>
            <span aria-hidden="true" className="hidden h-4 w-px bg-border sm:block" />
            <Link
              href="/app"
              className="hidden text-[12.5px] text-muted-foreground transition-colors hover:text-foreground sm:inline"
            >
              Back to workspace
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <span
              title={identity}
              className="flex max-w-56 items-center gap-2 rounded-md py-1 pr-2.5 pl-1 text-[12.5px] text-muted-foreground"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary-soft font-mono text-[10.5px] font-semibold text-primary">
                {initials}
              </span>
              <span className="hidden truncate sm:inline">{identity}</span>
            </span>
            <span aria-hidden="true" className="hidden h-4 w-px bg-border sm:block" />
            <ThemeToggle />
            <SignOutButton />
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-[1400px] gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[212px_minmax(0,1fr)] lg:py-8">
        <aside className="hidden lg:block">
          <div className="sticky top-20">
            <SidebarNav groups={adminNav} />
          </div>
        </aside>

        <MobileNav groups={adminNav} label="Admin" />

        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}