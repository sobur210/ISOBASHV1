import type { Metadata } from "next";
import Link from "next/link";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { MarketingNavbar } from "@/components/marketing/marketing-navbar";

export const metadata: Metadata = {
  title: "About | ISOBASH",
  description: "ISOBASH is a provider-agnostic AI operating platform for chat, agents, memory, research, files and media.",
};

const pillars = [
  {
    title: "Provider-agnostic by design",
    body: "The application never talks to a vendor SDK directly. Every capability goes through a router and a replaceable provider adapter, so a model or vendor can change without touching product code.",
  },
  {
    title: "Local, cloud, or hybrid",
    body: "ISOBASH routes each request against capability, health, latency and mode. Offline runs on local models, online runs on cloud providers, and hybrid mixes them per request.",
  },
  {
    title: "Real execution, honest failures",
    body: "Chat, agents, research, files, image and video generation run against real providers through background workers. When something fails, ISOBASH reports the failure instead of faking success.",
  },
  {
    title: "Secure by construction",
    body: "Server-side sessions, role-based authorization, MFA for administrators, rate limiting, audit trails, sandboxed execution and hardened outbound requests are enforced by the backend, never the browser.",
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
    <div className="flex min-h-screen flex-col bg-[#070B14]">
      <MarketingNavbar />
      <main className="flex-1">
        <section className="relative overflow-hidden border-b border-white/[0.06]">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_-10%,rgba(59,130,246,0.26),transparent_65%)]"
          />
          <div className="relative mx-auto w-full max-w-4xl px-4 py-24 sm:px-6 lg:px-8">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.24em] text-[#3B82F6]">About</p>
            <h1 className="mt-5 text-4xl font-bold tracking-[-0.03em] text-white sm:text-5xl">
              A serious AI operating platform.
            </h1>
            <p className="mt-6 text-[15px] leading-7 text-slate-400">
              ISOBASH brings chat, reasoning, autonomous agents, memory, projects, web research, files, document
              intelligence and media generation into a single workspace. It is built as an operating platform rather
              than a chat demo: every capability is backed by a real backend, a real database and real providers.
            </p>
          </div>
        </section>

        <section className="border-b border-white/[0.06]">
          <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-20 sm:px-6 md:grid-cols-2 lg:px-8">
            {pillars.map((pillar) => (
              <article key={pillar.title} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-7">
                <h2 className="text-[15px] font-semibold text-white">{pillar.title}</h2>
                <p className="mt-3 text-[13.5px] leading-6 text-slate-400">{pillar.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section>
          <div className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.18em] text-slate-500">Built with</h2>
            <ul className="mt-6 flex flex-wrap gap-2.5">
              {stack.map((item) => (
                <li
                  key={item}
                  className="rounded-full border border-[#3B82F6]/25 bg-[#3B82F6]/[0.08] px-4 py-2 text-[12.5px] text-slate-300"
                >
                  {item}
                </li>
              ))}
            </ul>

            <div className="mt-14 flex flex-col items-start gap-5 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-8 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[15px] font-semibold text-white">Your AI. Your Agents. Your Workspace.</p>
                <p className="mt-2 text-[13.5px] text-slate-400">
                  Create an account and work in the real platform, running on your own machine.
                </p>
              </div>
              <Link
                href="/register"
                className="shrink-0 rounded-full bg-[#3B82F6] px-6 py-3 text-[14px] font-semibold text-white transition-colors hover:bg-[#2563EB]"
              >
                Get Started Free
              </Link>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
