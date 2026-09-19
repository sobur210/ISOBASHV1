import Link from "next/link";
import { SidebarNav } from "@/components/sidebar-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  BotIcon,
  ChatIcon,
  CreditCardIcon,
  FileIcon,
  FolderIcon,
  GridIcon,
  ImageIcon,
  LogoutIcon,
  SearchIcon,
  SettingsIcon,
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

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2.5 font-mono text-sm font-bold tracking-[0.22em] text-primary">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              I
            </span>
            ISOBASH
          </Link>
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              Local workspace
            </span>
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
              Workspace
            </p>
            <SidebarNav items={workspaceNav} />
          </div>
        </div>

        <nav
          aria-label="Workspace"
          className="[scrollbar-width:none] [&::-webkit-scrollbar]:hidden -mx-4 flex gap-1 overflow-x-auto px-4 pb-1 lg:hidden"
        >
          {workspaceNav.map((item) => (
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