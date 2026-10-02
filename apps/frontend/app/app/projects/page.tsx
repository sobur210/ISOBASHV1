import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { ProjectsPanel } from "@/components/projects-panel";
import { requireUser } from "@/lib/auth-server";
import { featureVisible } from "@/lib/feature-flags";

/**
 * Phase 1: Projects is retired in favour of the Code Workspace.
 *
 * The page still exists — the module, the tables and the records that reference
 * them all stay — but when the flag is off there is nothing to show, so the
 * route sends the caller to the dashboard instead of rendering a dead panel.
 * `FeatureGuard` refuses the API for the same flag, so hiding the page and
 * refusing the endpoint cannot drift apart.
 */
export default async function ProjectsPage() {
  const user = await requireUser();
  if (!featureVisible("projects", user.role)) {
    redirect("/app");
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Workspace / Projects"
        title="Projects"
        description="One workspace per goal. Its tasks, agents, conversations, memories and files are scoped to it, and ownership is checked on the server."
        status="Retiring · superseded by Code"
      />
      <ProjectsPanel />
    </div>
  );
}