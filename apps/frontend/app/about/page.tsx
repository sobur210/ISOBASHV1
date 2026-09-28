import type { Metadata } from "next";
import { AuroraBackdrop } from "@/components/marketing/aurora-backdrop";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { MarketingNavbar } from "@/components/marketing/marketing-navbar";
import { ButtonLink } from "@/components/ui/button";
import { Section, SectionHeading } from "@/components/ui/section";
import { CpuIcon, LockIcon, ServerIcon, SparklesIcon } from "@/components/ui/icons";

export const metadata: Metadata = {
  title: "About",
  description:
    "ISOBASH is a provider-agnostic AI operating platform for chat, agents, memory, research, files and media.",
};

const pillars = [
  {
    title: "Provider-agnostic by design",
    body: "The application never talks to a vendor SDK directly. Every capability goes through a router and a replaceable provider adapter, so a model or vendor can change without touching product code.",
    icon: <SparklesIcon className="h-5 w-5" />,
  },
  {
    title: "Local, cloud, or hybrid",
    body: "ISOBASH routes each request against capability, health, latency and mode. Offline runs on local models, online runs on cloud providers, and hybrid mixes them per request.",
    icon: <ServerIcon className="h-5 w-5" />,
  },
  {
    title: "Real execution, honest failures",
    body: "Chat, agents, research, files, image and video generation run against real providers through background workers. When something fails, ISOBASH reports the failure instead of faking success.",
    icon: <CpuIcon className="h-5 w-5" />,
  },
  {
    title: "Secure by construction",
    body: "Server-side sessions, role-based authorization, MFA, rate limiting, audit trails, sandboxed execution and hardened outbound requests are enforced by the backend, never the browser.",
    icon: <LockIcon className="h-5 w-5" />,
  },
];

const stack = [
  "Next.js",
  "React",
  "TypeScript",
  "Tailwind CSS",
  "NestJS",
  "PostgreSQL",
  "Prisma",
  "Redis",
  "BullMQ",
  "Socket.IO",
  "Ollama",
];

export default function AboutPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <MarketingNavbar />

      <main className="flex-1">
        <section className="relative isolate overflow-hidden">
          <AuroraBackdrop />
          <div className="relative mx-auto w-full max-w-4xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary-soft px-3 py-1.5 font-mono text-[10.5px] font-semibold tracking-[0.2em] text-primary uppercase">
              About
            </span>
            <h1 className="mt-6 text-4xl font-bold tracking-[-0.04em] text-balance sm:text-[3.5rem] sm:leading-[1.05]">
              A serious AI operating platform.
            </h1>
            <p className="mt-6 max-w-2xl text-[15.5px] leading-8 text-pretty text-muted-foreground">
              ISOBASH brings chat, reasoning, autonomous agents, memory, projects, web research, files,
              document intelligence and media generation into a single workspace. It is built as an
              operating platform rather than a chat demo: every capability is backed by a real backend,
              a real database and real providers.
            </p>
          </div>
        </section>

        <Section className="pb-24">
          <div className="grid gap-4 md:grid-cols-2">
            {pillars.map((pillar) => (
              <article
                key={pillar.title}
                className="group edge-light rounded-2xl border border-border bg-surface p-7 shadow-soft transition-all duration-300 hover:border-primary/35 hover:shadow-lift"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-primary/20 bg-primary-soft text-primary">
                  {pillar.icon}
                </span>
                <h2 className="mt-5 text-[15px] font-semibold tracking-[-0.01em] text-foreground">
                  {pillar.title}
                </h2>
                <p className="mt-3 text-[13.5px] leading-6 text-muted-foreground">{pillar.body}</p>
              </article>
            ))}
          </div>
        </Section>

        <Section className="pb-24">
          <SectionHeading
            align="left"
            eyebrow="Built with"
            title="Deliberately boring infrastructure."
            lede="Proven pieces underneath, so the interesting work stays in the product layer."
          />
          <ul className="mt-8 flex flex-wrap gap-2.5">
            {stack.map((item) => (
              <li
                key={item}
                className="rounded-full border border-border bg-surface px-4 py-2 text-[12.5px] text-muted-foreground transition-colors hover:border-primary/35 hover:text-foreground"
              >
                {item}
              </li>
            ))}
          </ul>
        </Section>

        <Section className="pb-28">
          <div className="edge-light relative overflow-hidden rounded-[28px] border border-border bg-surface p-8 shadow-deep sm:p-12">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(110%_100%_at_100%_0%,color-mix(in_srgb,var(--primary)_18%,transparent),transparent_55%)]"
            />
            <div className="relative flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[17px] font-semibold tracking-[-0.02em] text-foreground">
                  Your AI. Your Agents. Your Workspace.
                </p>
                <p className="mt-2.5 max-w-md text-[13.5px] leading-6 text-muted-foreground">
                  Create an account and work in the real platform, running on your own machine.
                </p>
              </div>
              <ButtonLink href="/register" size="lg" className="shrink-0">
                Get started free
              </ButtonLink>
            </div>
          </div>
        </Section>
      </main>

      <MarketingFooter />
    </div>
  );
}
