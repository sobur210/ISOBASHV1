import { BrainIcon, GlobeIcon, LayersIcon } from "@/components/marketing/marketing-icons";
import { ChatIcon, FileIcon, ImageIcon, SearchIcon, VideoIcon } from "@/components/ui/icons";

const cards = [
  {
    title: "AI Chat & Assistants",
    description: "Chat with advanced AI models and create custom agents for your specific needs.",
    icon: <ChatIcon className="h-5 w-5" />,
    tone: "bg-blue-500/10 text-blue-500",
  },
  {
    title: "Image Generation",
    description: "Create high-quality images with multiple models and styles.",
    icon: <ImageIcon className="h-5 w-5" />,
    tone: "bg-violet-500/10 text-violet-500",
  },
  {
    title: "Video Generation",
    description: "Turn text, images or videos into stunning videos with AI.",
    icon: <VideoIcon className="h-5 w-5" />,
    tone: "bg-rose-500/10 text-rose-500",
  },
  {
    title: "Web Research",
    description: "Get real-time information with verified sources and citations.",
    icon: <SearchIcon className="h-5 w-5" />,
    tone: "bg-emerald-500/10 text-emerald-500",
  },
  {
    title: "File & Document Analysis",
    description: "Upload and analyze PDFs, documents, spreadsheets and more.",
    icon: <FileIcon className="h-5 w-5" />,
    tone: "bg-orange-500/10 text-orange-500",
  },
  {
    title: "Memory & Context",
    description: "Your AI remembers, so you don&rsquo;t have to.",
    icon: <BrainIcon className="h-5 w-5" />,
    tone: "bg-orange-500/10 text-orange-500",
  },
  {
    title: "Projects & Collaboration",
    description: "Organize your work and collaborate with your team.",
    icon: <LayersIcon className="h-5 w-5" />,
    tone: "bg-violet-500/10 text-violet-500",
  },
  {
    title: "Multi-Provider AI",
    description: "Access the best models from multiple providers &mdash; including local options.",
    icon: <GlobeIcon className="h-5 w-5" />,
    tone: "bg-blue-500/10 text-blue-500",
  },
];

export function FeatureCards() {
  return (
    <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <article
          key={card.title}
          className="group rounded-2xl border border-slate-200 bg-white p-7 shadow-[0_2px_10px_rgba(15,23,42,0.04)] transition-all hover:-translate-y-1 hover:border-[#3B82F6]/40 hover:shadow-[0_18px_40px_-16px_rgba(15,23,42,0.18)]"
        >
          <span
            className={`flex h-12 w-12 items-center justify-center rounded-full ${card.tone} transition-transform group-hover:scale-105`}
          >
            {card.icon}
          </span>
          <h3 className="mt-6 text-[15px] font-semibold tracking-[-0.01em] text-slate-900">{card.title}</h3>
          <p className="mt-2.5 text-[13px] leading-6 text-slate-500">{card.description}</p>
        </article>
      ))}
    </div>
  );
}

export function FeatureSection() {
  return (
    <section id="features" className="scroll-mt-20 bg-[#F8FAFC] py-24">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.24em] text-[#3B82F6]">
            Everything you need in one platform
          </p>
          <h2 className="mt-5 text-3xl font-bold tracking-[-0.03em] text-slate-900 sm:text-[2.6rem] sm:leading-[1.1]">
            Powerful Features for Endless Possibilities
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-[15px] leading-7 text-slate-500">
            From simple tasks to complex projects, ISOBASH gives you the tools to be more creative, productive and
            innovative &mdash; all in one place.
          </p>
        </div>
        <FeatureCards />
      </div>
    </section>
  );
}
