import Link from "next/link";
import { SidebarNav } from "@/components/sidebar-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  ChartIcon,
  HomeIcon,
  LogoutIcon,
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

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2.5 font-mono text-sm font-bold tracking-[0.22em] text-primary">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              I
            </span>
            ISOBASH
            <span className="ml-2 hidden items-center gap-1.5 rounded-full border border-accent/40 bg-accent-soft px-2.5 py-1 font-mono text-[10px] tracking-[0.14em] text-accent sm:inline-flex">
              <ShieldIcon className="h-3 w-3" />
              ADMIN
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/app"
              className="hidden items-center rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
            >
              Back to workspace
            </Link>
            <ThemeToggle />
            <Link
              href="/login"
              aria-label="Sign out"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-danger/50 hover:text-danger"
            >
              <LogoutIcon className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[220px_1fr] lg:px-8 lg:py-10">
        <div className="hidden lg:block">
          <div className="sticky top-24">
            <p className="mb-4 px-3 font-mono text-[10px] font-medium uppercase tracking-[0.24em] text-muted-foreground">
              Control center
            </p>
            <SidebarNav items={adminNav} />
          </div>
        </div>

        <nav aria-label="Admin" className="[scrollbar-width:none] [&::-webkit-scrollbar]:hidden -mx-4 flex gap-1 overflow-x-auto px-4 pb-1 lg:hidden">
          {adminNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="inline-flex shrink-0 items-center gap-2 rounded-full border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
            >
              {item.icon}
              {item.label}
            </Link>
          ))}
        </nav>

        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}