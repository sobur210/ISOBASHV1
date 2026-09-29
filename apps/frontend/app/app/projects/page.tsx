import { PageHeader } from "@/components/page-header";
import { ProjectsPanel } from "@/components/projects-panel";

export default function ProjectsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Workspace / Projects"
        title="Projects"
        description="One workspace per goal. Its tasks, agents, conversations, memories and files are scoped to it, and ownership is checked on the server."
        status="Phase 10 · live"
      />
      <ProjectsPanel />
    </div>
  );
}
