import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { MobileNav } from "@/components/mobile-nav";
import { SidebarNav } from "@/components/sidebar-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { SignOutButton } from "@/components/sign-out-button";
import { requireUser } from "@/lib/auth-server";
import type { NavGroup } from "@/components/sidebar-nav";
import { type FeatureName, featureVisible } from "@/lib/feature-flags";
import {
  BotIcon,
  ChatIcon,
  CpuIcon,
  CreditCardIcon,
  FileIcon,
  FolderIcon,
  GridIcon,
  ImageIcon,
  SearchIcon,
  SettingsIcon,
  ShieldIcon,
} from "@/components/ui/icons";

type NavEntry = { href: string; label: string; icon: React.ReactNode; feature?: FeatureName };

/**
 * `feature` marks an entry that a Phase 1 flag can retire. Entries without one are
 * always shown. Filtering happens here rather than in `SidebarNav` so the decision
 * is made once, on the server, from the session's role.
 *
 * Groups are ordered by what the account is doing — build, find, then administer
 * the account itself — so the rail reads as a sequence rather than a flat list.
 */
const navGroups: { label: string; items: NavEntry[] }[] = [
  {
    label: "Build",
    items: [
      { href: "/app", label: "Workspace", icon: <GridIcon className="h-4 w-4" /> },
      { href: "/app/chat", label: "Chat", icon: <ChatIcon className="h-4 w-4" /> },
      { href: "/app/research", label: "Research", icon: <SearchIcon className="h-4 w-4" /> },
      { href: "/app/agents", label: "Agents", icon: <BotIcon className="h-4 w-4" /> },
      { href: "/app/code", label: "Code", icon: <CpuIcon className="h-4 w-4" />, feature: "codeWorkspace" },
    ],
  },
  {
    label: "Organise",
    items: [
      { href: "/app/projects", label: "Projects", icon: <FolderIcon className="h-4 w-4" />, feature: "projects" },
      { href: "/app/files", label: "Files", icon: <FileIcon className="h-4 w-4" />, feature: "files" },
      { href: "/app/media", label: "Media", icon: <ImageIcon className="h-4 w-4" /> },
    ],
  },
  {
    label: "Account",
    items: [
      { href: "/app/billing", label: "Billing", icon: <CreditCardIcon className="h-4 w-4" /> },
      { href: "/app/settings", label: "Settings", icon: <SettingsIcon className="h-4 w-4" /> },
    ],
  },
];

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const identity = user.name ?? user.email;
  const initials = identity.trim().charAt(0).toUpperCase();
  const groups: NavGroup[] = navGroups
    .map((group) => ({
      label: group.label,
      items: group.items
        .filter((item) => !item.feature || featureVisible(item.feature, user.role))
        .map(({ href, label, icon }) => ({ href, label, icon })),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-full max-w-[1400px] items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/app" className="inline-flex shrink-0 items-center" aria-label="ISOBASH workspace">
            <BrandLogo className="h-6 w-auto" priority />
          </Link>

          <div className="flex items-center gap-2">
            {user.role === "ADMIN" ? (
              <Link
                href="/admin"
                className="inline-flex items-center gap-1.5 rounded-md border border-accent/30 bg-accent-soft px-2 py-1 font-mono text-[10px] font-medium tracking-[0.14em] text-accent uppercase transition-colors hover:border-accent/60"
              >
                <ShieldIcon className="h-3 w-3" />
                Admin
              </Link>
            ) : null}

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
            <p className="mb-4 px-2.5 font-mono text-[10px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
              Workspace
            </p>
            <SidebarNav groups={groups} />
          </div>
        </aside>

        <MobileNav groups={groups} label="Workspace" />

        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}