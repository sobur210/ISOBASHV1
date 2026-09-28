import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { MobileNav } from "@/components/mobile-nav";
import { SidebarNav } from "@/components/sidebar-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { SignOutButton } from "@/components/sign-out-button";
import { requireUser } from "@/lib/auth-server";
import {
  BotIcon,
  ChatIcon,
  CreditCardIcon,
  FileIcon,
  FolderIcon,
  GridIcon,
  ImageIcon,
  SearchIcon,
  SettingsIcon,
  ShieldIcon,
} from "@/components/ui/icons";

const workspaceNav = [
  { href: "/app", label: "Workspace", icon: <GridIcon className="h-4 w-4" /> },
  { href: "/app/chat", label: "Chat", icon: <ChatIcon className="h-4 w-4" /> },
  { href: "/app/research", label: "Research", icon: <SearchIcon className="h-4 w-4" /> },
  { href: "/app/agents", label: "Agents", icon: <BotIcon className="h-4 w-4" /> },
  { href: "/app/projects", label: "Projects", icon: <FolderIcon className="h-4 w-4" /> },
  { href: "/app/files", label: "Files", icon: <FileIcon className="h-4 w-4" /> },
  { href: "/app/media", label: "Media", icon: <ImageIcon className="h-4 w-4" /> },
  { href: "/app/billing", label: "Billing", icon: <CreditCardIcon className="h-4 w-4" /> },
  { href: "/app/settings", label: "Settings", icon: <SettingsIcon className="h-4 w-4" /> },
];

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const identity = user.name ?? user.email;
  const initials = identity.trim().charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link href="/" className="inline-flex items-center" aria-label="ISOBASH home">
            <BrandLogo className="h-6 w-auto" priority />
          </Link>

          <div className="flex items-center gap-2">
            {user.role === "ADMIN" ? (
              <Link
                href="/admin"
                className="hidden items-center gap-1.5 rounded-full border border-accent/30 bg-accent-soft px-3 py-1.5 font-mono text-[10.5px] font-medium tracking-[0.12em] text-accent uppercase transition-colors hover:border-accent/60 sm:inline-flex"
              >
                <ShieldIcon className="h-3.5 w-3.5" />
                Admin
              </Link>
            ) : null}

            <span
              title={identity}
              className="hidden max-w-56 items-center gap-2.5 rounded-full border border-border bg-surface-2 py-1 pr-3.5 pl-1 text-[12.5px] text-muted-foreground sm:inline-flex"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-soft font-mono text-[11px] font-semibold text-primary">
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
            <p className="mb-4 px-3 font-mono text-[10px] font-medium tracking-[0.24em] text-muted-foreground uppercase">
              Workspace
            </p>
            <SidebarNav items={workspaceNav} />
          </div>
        </div>

        <MobileNav items={workspaceNav} label="Workspace" />

        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
