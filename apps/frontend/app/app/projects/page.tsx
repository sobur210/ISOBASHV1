import { PageHeader } from "@/components/page-header";
import { PlaceholderCard } from "@/components/placeholder-card";
import { FolderIcon, UsersIcon } from "@/components/ui/icons";

export default function ProjectsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Workspace / Projects"
        title="Projects"
        description="A route boundary for owned workspaces, task state, members, sharing, and project memory."
        status="Phase 10"
      />
      <PlaceholderCard
        icon={<FolderIcon className="h-5 w-5" />}
        title="No projects yet"
        description="Projects will store real task state, membership, and project-scoped memory backed by the database."
        feature="Integrated in Phase 10"
      />
      <PlaceholderCard
        icon={<UsersIcon className="h-5 w-5" />}
        title="Ownership enforced"
        description="Project access will be enforced server-side from database ownership, never from client claims."
        feature="Security requirement — spec §20"
      />
    </div>
  );
}