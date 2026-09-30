import type { ReactNode } from "react";
import { Section, SectionHeading } from "@/components/ui/section";
import {
  BrainIcon,
  ChatIcon,
  FileIcon,
  GlobeIcon,
  ImageIcon,
  LayersIcon,
  SearchIcon,
  VideoIcon,
} from "@/components/ui/icons";

type Feature = {
  title: string;
  description: string;
  icon: ReactNode;
  tone: string;
  span: string;
};

const features: Feature[] = [
  {
    title: "AI Chat & Assistants",
    description:
      "Conversations that stream token by token and persist to PostgreSQL. Switch providers per message: the routing layer picks the right one for the job.",
    icon: <ChatIcon className="h-5 w-5" />,
    tone: "from-primary/18",
    span: "lg:col-span-3",
  },
  {
    title: "Image Generation",
    description: "High-quality images across multiple models and styles.",
    icon: <ImageIcon className="h-5 w-5" />,
    tone: "from-violet/18",
    span: "lg:col-span-3",
  },
  {
    title: "Video Generation",
    description: "Turn text or images into video through queued jobs.",
    icon: <VideoIcon className="h-5 w-5" />,
    tone: "from-accent/18",
    span: "lg:col-span-3",
  },
  {
    title: "Web Research",
    description: "Real-time answers with every citation checked against the source text it came from.",
    icon: <SearchIcon className="h-5 w-5" />,
    tone: "from-success/18",
    span: "lg:col-span-3",
  },
  {
    title: "Document Analysis",
    description: "Upload PDFs, Markdown, HTML, CSV, JSON or text and query what was really extracted from them.",
    icon: <FileIcon className="h-5 w-5" />,
    tone: "from-warning/18",
    span: "lg:col-span-3",
  },
  {
    title: "Memory & Context",
    description: "Your AI remembers, so you don’t have to.",
    icon: <BrainIcon className="h-5 w-5" />,
    tone: "from-primary/18",
    span: "lg:col-span-3",
  },
  {
    title: "Projects & Collaboration",
    description: "Organise work and share it with your team.",
    icon: <LayersIcon className="h-5 w-5" />,
    tone: "from-violet/18",
    span: "lg:col-span-3",
  },
  {
    title: "Multi-Provider AI",
    description: "Local models and cloud vendors behind one interface, including fully offline.",
    icon: <GlobeIcon className="h-5 w-5" />,
    tone: "from-accent/18",
    span: "lg:col-span-3",
  },
];

function FeatureBento() {
  return (
    <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-12">
      {features.map((feature) => (
        <article
          key={feature.title}
          className={`group edge-light relative overflow-hidden rounded-2xl border border-border bg-surface p-6 shadow-soft transition-all duration-300 hover:-translate-y-1 hover:border-primary/35 hover:shadow-lift sm:p-7 ${feature.span}`}
        >
          {/* Tint wash that grows on hover. */}
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute -top-24 -right-16 h-48 w-48 rounded-full bg-gradient-to-br ${feature.tone} to-transparent opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100`}
          />
          <span className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-primary/20 bg-primary-soft text-primary transition-transform duration-300 group-hover:scale-105">
            {feature.icon}
          </span>
          <h3 className="relative mt-5 text-[15px] font-semibold tracking-[-0.01em] text-foreground">
            {feature.title}
          </h3>
          <p className="relative mt-2.5 text-[13.5px] leading-6 text-muted-foreground">
            {feature.description}
          </p>
        </article>
      ))}
    </div>
  );
}

export function FeatureSection() {
  return (
    <Section id="features" className="py-24 sm:py-28">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent"
      />
      <SectionHeading
        eyebrow="Everything in one platform"
        title={
          <>
            Powerful features,
            <br className="hidden sm:block" /> no <span className="text-gradient">tab juggling</span>
          </>
        }
        lede="From a one-line prompt to a full project: chat, agents, research, files and media all run against real providers through one engine. Never a mock."
      />
      <FeatureBento />
    </Section>
  );
}
