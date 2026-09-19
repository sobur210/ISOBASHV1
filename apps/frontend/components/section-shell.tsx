import Link from "next/link";

type SectionShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  status?: string;
};

const navigation = [
  ["Workspace", "/app"],
  ["Chat", "/app/chat"],
  ["Agents", "/app/agents"],
  ["Projects", "/app/projects"],
  ["Files", "/app/files"],
  ["Media", "/app/media"],
  ["Settings", "/app/settings"],
];

export function SectionShell({ eyebrow, title, description, status = "Foundation route" }: SectionShellProps) {
  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-6 py-8 lg:px-12">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--line)] pb-6">
        <Link href="/" className="font-mono text-sm font-bold tracking-[0.24em] text-[var(--accent)]">ISOBASH</Link>
        <Link href="/login" className="text-sm text-[var(--muted)] hover:text-[var(--text)]">Sign out</Link>
      </header>
      <div className="grid gap-10 py-10 lg:grid-cols-[220px_1fr]">
        <aside className="border-b border-[var(--line)] pb-6 lg:border-b-0 lg:border-r lg:pr-6">
          <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.24em] text-[var(--muted)]">Workspace</p>
          <nav className="grid gap-1">
            {navigation.map(([label, href]) => <Link key={href} href={href} className="rounded px-3 py-2 text-sm text-[var(--muted)] hover:bg-[var(--panel)] hover:text-[var(--text)]">{label}</Link>)}
          </nav>
        </aside>
        <section>
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-[var(--accent)]">{eyebrow}</p>
          <div className="mt-4 flex flex-wrap items-start justify-between gap-6">
            <div>
              <h1 className="text-4xl font-semibold tracking-[-0.03em] text-[var(--text)]">{title}</h1>
              <p className="mt-4 max-w-2xl leading-7 text-[var(--muted)]">{description}</p>
            </div>
            <span className="border border-[var(--line)] px-3 py-2 font-mono text-xs text-[var(--muted)]">{status}</span>
          </div>
          <div className="mt-12 border border-[var(--line)] bg-[var(--panel)] p-6">
            <p className="font-medium text-[var(--text)]">This foundation route is ready for its dedicated phase.</p>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">No simulated data is shown here. Real functionality will be connected behind this boundary when its phase begins.</p>
          </div>
        </section>
      </div>
    </main>
  );
}
