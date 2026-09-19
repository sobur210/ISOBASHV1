import { PageHeader } from "@/components/page-header";
import { PlaceholderCard } from "@/components/placeholder-card";
import { BotIcon, ChatIcon, FolderIcon, GridIcon, SearchIcon } from "@/components/ui/icons";

export default function WorkspacePage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Workspace"
        title="Your workspace"
        description="The authenticated shell that will host projects, agents, memory, research, and tools."
        status="Auth boundary pending"
      />
      <div className="grid gap-5 md:grid-cols-2">
        <PlaceholderCard
          icon={<GridIcon className="h-5 w-5" />}
          title="Surface overview"
          description="Projects, recent activity, and pinned memory will surface here once the workspace data model is live."
          feature="Boundary only — no fake data"
        />
        <PlaceholderCard
          icon={<ChatIcon className="h-5 w-5" />}
          title="Continue where you left off"
          description="Real conversations and agent runs will be listed here with their actual state and history."
          feature="Boundary only — no fake data"
        />
      </div>
    </div>
  );
}