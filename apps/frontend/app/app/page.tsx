import { PageHeader } from "@/components/page-header";
import { HealthPanel } from "@/components/health-panel";
import { CapabilitiesPanel } from "@/components/capabilities-panel";
import { FeatureCard } from "@/components/feature-card";
import { requireUser } from "@/lib/auth-server";
import { type FeatureName, featureVisible } from "@/lib/feature-flags";
import {
  BotIcon,
  ChatIcon,
  CpuIcon,
  CreditCardIcon,
  FileIcon,
  FolderIcon,
  ImageIcon,
  SearchIcon,
} from "@/components/ui/icons";

/**
 * `feature` marks a card a Phase 1 flag can retire. Cards without one always
 * show. The copy below states what each surface actually does — no card claims
 * a capability the code does not have.
 */
const surfaces: {
  href: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  phase: string;
  feature?: FeatureName;
}[] = [
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
    phase: "Live now",
  },
  {
    href: "/app/code",
    title: "Code Workspace",
    description: "An editor over your own files, replacing Projects and Files. Being built now.",
    icon: <CpuIcon className="h-5 w-5" />,
    phase: "Phase 17 · in build",
    feature: "codeWorkspace",
  },
  {
    href: "/app/files",
    title: "Files",
    description: "Validated uploads, real document extraction, and keyword/vector knowledge search.",
    icon: <FileIcon className="h-5 w-5" />,
    phase: "Retiring",
    feature: "files",
  },
  {
    href: "/app/projects",
    title: "Projects",
    description: "Project spaces that bring chats, files, and agents together.",
    icon: <FolderIcon className="h-5 w-5" />,
    phase: "Retiring",
    feature: "projects",
  },
  {
    href: "/app/agents",
    title: "Agents",
    description: "Autonomous agents with goals, tools, and memory.",
    icon: <BotIcon className="h-5 w-5" />,
    phase: "Phase 10 API",
  },
  {
    href: "/app/media",
    title: "Media",
    description: "Image generation through a provider that really renders, a media library, and the history of every run.",
    icon: <ImageIcon className="h-5 w-5" />,
    phase: "Phase 13 · images",
  },
  {
    href: "/app/billing",
    title: "Billing",
    description: "Plan, usage, and payment management for this account.",
    icon: <CreditCardIcon className="h-5 w-5" />,
    phase: "Phase 16",
  },
];

export default async function WorkspacePage() {
  const user = await requireUser();
  const visible = surfaces.filter(
    (surface) => !surface.feature || featureVisible(surface.feature, user.role),
  );
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Workspace"
        title="Your workspace"
        description="Live system state from the API and everything you will work with: chat, research, code, agents, and media."
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
          {visible.map((surface) => (
            <FeatureCard key={surface.href} {...surface} />
          ))}
        </div>
      </section>
    </div>
  );
}