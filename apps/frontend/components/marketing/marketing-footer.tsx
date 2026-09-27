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
    ],
  },
];

export function MarketingFooter() {
  return (
    <footer className="border-t border-white/[0.06] bg-[#070B14]">
      <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_2fr]">
          <div>
            <Link href="/" className="flex items-center gap-2.5">
              <BrandLogo className="h-7 w-auto brightness-0 invert" />
              <span className="font-mono text-[15px] font-bold tracking-[0.28em] text-white">ISOBASH</span>
            </Link>
            <p className="mt-5 max-w-xs text-[13px] leading-6 text-slate-400">
              Your AI. Your Agents. Your Workspace. A provider-agnostic AI operating platform that runs locally, in
              the cloud, or both.
            </p>
          </div>

          <div className="grid gap-10 sm:grid-cols-3">
            {columns.map((column) => (
              <div key={column.title}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  {column.title}
                </p>
                <ul className="mt-4 space-y-2.5">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        className="text-[13px] text-slate-400 transition-colors hover:text-white"
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

        <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-white/[0.06] pt-8 sm:flex-row">
          <p className="text-[12px] text-slate-500">
            &copy; {new Date().getFullYear()} ISOBASH. All rights reserved.
          </p>
          <p className="font-mono text-[11px] tracking-[0.2em] text-slate-600">LOCAL-FIRST &middot; CLOUD-READY</p>
        </div>
      </div>
    </footer>
  );
}
