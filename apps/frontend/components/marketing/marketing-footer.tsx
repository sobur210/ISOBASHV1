import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";

const columns = [
  {
    title: "Product",
    links: [
      { label: "AI Chat", href: "/app/chat" },
      { label: "Agents", href: "/app/agents" },
      { label: "Research", href: "/app/research" },
      { label: "Files", href: "/app/files" },
      { label: "Media", href: "/app/media" },
    ],
  },
  {
    title: "Platform",
    links: [
      { label: "Features", href: "/#features" },
      { label: "Pricing", href: "/app/billing" },
      { label: "Blog", href: "/blog" },
      { label: "About", href: "/about" },
    ],
  },
  {
    title: "Account",
    links: [
      { label: "Sign In", href: "/login" },
      { label: "Get Started Free", href: "/register" },
      { label: "Settings", href: "/app/settings" },
      { label: "Admin", href: "/admin" },
    ],
  },
];

export function MarketingFooter() {
  return (
    <footer className="relative border-t border-border bg-surface-2/40">
      <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[1.3fr_2fr]">
          <div>
            <Link href="/" className="inline-flex items-center" aria-label="ISOBASH home">
              <BrandLogo className="h-8 w-auto" />
            </Link>
            <p className="mt-5 max-w-xs text-[13px] leading-6 text-muted-foreground">
              A provider-agnostic AI operating platform that runs locally, in the cloud, or both.
            </p>
            <p className="mt-6 font-mono text-[10.5px] tracking-[0.2em] text-muted-foreground/70 uppercase">
              Local-first · Cloud-ready
            </p>
          </div>

          <div className="grid gap-10 sm:grid-cols-3">
            {columns.map((column) => (
              <div key={column.title}>
                <p className="font-mono text-[10.5px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
                  {column.title}
                </p>
                <ul className="mt-4 space-y-3">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        className="text-[13px] text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-border pt-8 sm:flex-row">
          <p className="text-[12px] text-muted-foreground">
            © {new Date().getFullYear()} ISOBASH. All rights reserved.
          </p>
          <p className="font-mono text-[10.5px] tracking-[0.2em] text-muted-foreground/60 uppercase">
            Your AI. Your Agents. Your Workspace.
          </p>
        </div>
      </div>
    </footer>
  );
}
