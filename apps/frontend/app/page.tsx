import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-8 lg:px-12">
      <header className="flex items-center justify-between border-b border-[var(--line)] pb-6">
        <Link href="/" className="font-mono text-sm font-bold tracking-[0.24em] text-[var(--accent)]">
          ISOBASH
        </Link>
        <nav className="flex items-center gap-3 text-sm">
          <Link href="/login" className="rounded-full px-4 py-2 text-[var(--muted)] hover:text-[var(--text)]">
            Sign in
          </Link>
          <Link href="/register" className="rounded-full bg-[var(--accent)] px-4 py-2 font-semibold text-[#10211f] hover:bg-[#b8f0d5]">
            Create account
          </Link>
        </nav>
      </header>

      <section className="grid flex-1 items-center gap-12 py-16 lg:grid-cols-[1.1fr_0.9fr] lg:py-24">
        <div>
          <p className="mb-6 font-mono text-xs uppercase tracking-[0.28em] text-[var(--accent)]">AI workspace foundation</p>
          <h1 className="max-w-4xl text-5xl font-semibold leading-[0.98] tracking-[-0.04em] text-[var(--text)] sm:text-7xl">
            Your AI. Your agents. Your workspace.
          </h1>
          <p className="mt-8 max-w-xl text-lg leading-8 text-[var(--muted)]">
            A focused home for conversations, projects, memory, and the tools that help work move forward.
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <Link href="/app" className="rounded-full bg-[var(--accent)] px-6 py-3 font-semibold text-[#10211f] hover:bg-[#b8f0d5]">
              Open workspace
            </Link>
            <Link href="/app/projects" className="rounded-full border border-[var(--line)] px-6 py-3 font-semibold text-[var(--text)] hover:border-[var(--accent)]">
              Explore projects
            </Link>
          </div>
        </div>

        <div className="border border-[var(--line)] bg-[var(--panel)] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.22)]">
          <div className="mb-10 flex items-center justify-between border-b border-[var(--line)] pb-4">
            <span className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Workspace status</span>
            <span className="flex items-center gap-2 text-xs text-[var(--accent)]"><span className="h-2 w-2 rounded-full bg-[var(--accent)]" />Local foundation</span>
          </div>
          <div className="space-y-5">
            {["Projects", "Agents", "Memory", "Realtime"].map((item, index) => (
              <div key={item} className="flex items-center justify-between border-b border-[var(--line)] pb-4 last:border-0 last:pb-0">
                <span className="text-[var(--muted)]">{item}</span>
                <span className="font-mono text-sm text-[var(--text)]">{index < 2 ? "Foundation" : "Ready to connect"}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
