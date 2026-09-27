import Link from "next/link";
import Image from "next/image";
import { ButtonLink } from "@/components/ui/button";
import {
  ArrowRightIcon,
  BotIcon,
  ChatIcon,
  CpuIcon,
  DatabaseIcon,
  FileIcon,
  ImageIcon,
  SearchIcon,
  SparklesIcon,
  VideoIcon,
} from "@/components/ui/icons";
import { ThemeToggle } from "@/components/theme-toggle";

const capabilities = [
  {
    icon: <ChatIcon className="h-5 w-5" />,
    title: "AI chat",
    description: "Streaming conversations across multiple providers and models, persisted with full history.",
  },
  {
    icon: <BotIcon className="h-5 w-5" />,
    title: "Autonomous agents",
    description: "Real agents with instructions, tools, memory, planning, and governed execution.",
  },
  {
    icon: <SearchIcon className="h-5 w-5" />,
    title: "Web research",
    description: "Source-tracked retrieval with citations, provenance, and hardened network access.",
  },
  {
    icon: <FileIcon className="h-5 w-5" />,
    title: "Files & documents",
    description: "Secure uploads, document intelligence, embeddings, and retrieval over your knowledge.",
  },
  {
    icon: <ImageIcon className="h-5 w-5" />,
    title: "Image generation",
    description: "Real image generation, understanding, and editing backed by provider routing.",
  },
  {
    icon: <VideoIcon className="h-5 w-5" />,
    title: "Video engine",
    description: "Queue-based text-to-video, image-to-video, and animation with real job progress.",
  },
];

const pillars = [
  {
    icon: <CpuIcon className="h-5 w-5" />,
    title: "Local, cloud, or hybrid",
    description: "Run models offline, online, or route between them based on capability and availability.",
  },
  {
    icon: <DatabaseIcon className="h-5 w-5" />,
    title: "Memory & knowledge",
    description: "Persisted memory, RAG, and indexed knowledge with source provenance from online research.",
  },
  {
    icon: <SparklesIcon className="h-5 w-5" />,
    title: "Provider-agnostic core",
    description: "A capability router over replaceable provider adapters — never locked to one vendor.",
  },
];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2.5 font-mono text-sm font-bold tracking-[0.22em] text-primary">
            <Image src="/logo.png" alt="ISOBASH" width={128} height={32} className="h-8 w-auto" priority />
          </Link>
          <nav className="flex items-center gap-2">
            <ThemeToggle />
            <ButtonLink href="/login" variant="ghost" size="sm">
              Sign in
            </ButtonLink>
            <ButtonLink href="/register" variant="primary" size="sm">
              Create account
            </ButtonLink>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="relative overflow-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_-10%,rgba(59,130,246,0.18),transparent)]"
          />
          <div className="mx-auto grid w-full max-w-7xl gap-14 px-4 py-20 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:px-8 lg:py-28">
            <div className="text-left">
              <h1 className="max-w-3xl text-5xl font-semibold leading-[0.98] tracking-[-0.035em] text-foreground sm:text-6xl lg:text-7xl">
                Your AI. Your agents.{" "}
                <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                  Your workspace.
                </span>
              </h1>
              <p className="mt-7 max-w-xl text-lg leading-8 text-muted-foreground">
                One place for chat, reasoning, autonomous agents, memory, research, files, and media — powered by a
                provider-agnostic engine that runs locally, in the cloud, or both.
              </p>
              <div className="mt-10 flex flex-wrap items-center gap-4">
                <ButtonLink href="/app" variant="primary" size="lg">
                  Open workspace <ArrowRightIcon className="h-4 w-4" />
                </ButtonLink>
                <ButtonLink href="/admin" variant="outline" size="lg">
                  Watch A Demo
                </ButtonLink>
              </div>
            </div>

            <div className="relative hidden overflow-hidden rounded-3xl border border-border/60 bg-surface shadow-[0_32px_90px_rgba(0,0,0,0.25)] lg:block">
              <Image
                src="https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=1200&q=80"
                alt="Developer workspace with source code on screen"
                width={1200}
                height={800}
                sizes="(min-width: 1024px) 45vw, 100vw"
                className="h-full w-full object-cover"
                priority
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background/70 via-transparent to-transparent" />
              <div className="absolute bottom-5 left-5 flex items-center gap-2 rounded-full border border-border/60 bg-background/80 px-4 py-2 font-mono text-xs text-muted-foreground backdrop-blur">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                Local-first · Cloud-ready
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-border">
          <div className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <p className="font-mono text-xs font-medium uppercase tracking-[0.24em] text-accent">Capabilities</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-[-0.02em] text-foreground sm:text-4xl">
                A real platform, built phase by phase.
              </h2>
              <p className="mt-4 leading-7 text-muted-foreground">
                These are the products ISOBASH will ship — each backed by real implementation, not placeholders.
              </p>
            </div>
            <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {capabilities.map((item) => (
                <div
                  key={item.title}
                  className="group rounded-2xl border border-border bg-surface p-6 transition-colors hover:border-primary/40"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-accent-soft text-accent transition-colors group-hover:text-primary">
                    {item.icon}
                  </div>
                  <h3 className="mt-5 font-medium text-foreground">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-border bg-surface/50">
          <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
            <div className="grid gap-5 md:grid-cols-3">
              {pillars.map((pillar) => (
                <div key={pillar.title} className="flex gap-4 rounded-2xl border border-border bg-background/40 p-6">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    {pillar.icon}
                  </div>
                  <div>
                    <h3 className="font-medium text-foreground">{pillar.title}</h3>
                    <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{pillar.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6 lg:px-8">
          <p className="font-mono text-xs tracking-[0.22em] text-muted-foreground">ISOBASH</p>
          <p className="text-xs text-muted-foreground">Your AI. Your Agents. Your Workspace.</p>
          <nav className="flex items-center gap-5 text-xs text-muted-foreground">
            <Link href="/app" className="hover:text-foreground">Workspace</Link>
            <Link href="/login" className="hover:text-foreground">Sign in</Link>
            <Link href="/register" className="hover:text-foreground">Create account</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}