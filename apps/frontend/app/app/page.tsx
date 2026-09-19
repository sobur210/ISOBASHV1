import { PageHeader } from "@/components/page-header";
import { HealthPanel } from "@/components/health-panel";
import { CapabilitiesPanel } from "@/components/capabilities-panel";
import { FeatureCard } from "@/components/feature-card";
import {
  BotIcon,
  ChatIcon,
  CreditCardIcon,
  FileIcon,
  FolderIcon,
  ImageIcon,
  SearchIcon,
} from "@/components/ui/icons";

const surfaces = [
  {
    href: "/app/chat",
    title: "Chat",
    description: "Live conversations with streamed responses, persisted to PostgreSQL.",
    icon: <ChatIcon className="h-5 w-5" />,
    phase: "Live now",
  },
  {
    href: "/app/research",
    title: "Research",
    description: "Web research with sources, citations, and retrieval-backed answers.",
    icon: <SearchIcon className="h-5 w-5" />,
    phase: "Phase 11",
  },
  {
    href: "/app/files",
    title: "Files",
    description: "Uploads, document intelligence, and knowledge ingestion.",
    icon: <FileIcon className="h-5 w-5" />,
    phase: "Phase 12",
  },
  {
    href: "/app/projects",
    title: "Projects",
    description: "Project spaces that bring chats, files, and agents together.",
    icon: <FolderIcon className="h-5 w-5" />,
    phase: "Phase 13",
  },
  {
    href: "/app/agents",
    title: "Agents",
    description: "Autonomous agents with goals, tools, and memory.",
    icon: <BotIcon className="h-5 w-5" />,
    phase: "Phase 14",
  },
  {
    href: "/app/media",
    title: "Media",
    description: "Image and video generation, gallery, and generations history.",
    icon: <ImageIcon className="h-5 w-5" />,
    phase: "Phase 15",
  },
  {
    href: "/app/billing",
    title: "Billing",
    description: "Plan, usage, and payment management for this account.",
    icon: <CreditCardIcon className="h-5 w-5" />,
    phase: "Phase 16",
  },
];

export default function WorkspacePage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Workspace"
        title="Your workspace"
        description="Live system state from the API and everything you will work with: chat, research, files, projects, agents, and media."
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <HealthPanel />
        <CapabilitiesPanel />
      </div>

      <section aria-labelledby="surfaces-heading">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.24em] text-muted-foreground">
              Surfaces
            </p>
            <h2 id="surfaces-heading" className="mt-1 text-lg font-semibold text-foreground">
              Everything ISOBASH can hold
            </h2>
          </div>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {surfaces.map((surface) => (
            <FeatureCard key={surface.href} {...surface} />
          ))}
        </div>
      </section>
    </div>
  );
}