import { PageHeader } from "@/components/page-header";
import { WorkspaceClone } from "@/components/code/workspace-clone";
import { featureFlags } from "@/lib/feature-flags";

/**
 * Code Workspace.
 *
 * The surface is a visual clone of a Replit-style workspace: a file tree, an
 * editor pane and a preview/console pane, all presentational. Nothing is
 * fetched and nothing is saved — there is no editor or file API behind this.
 */
export default function CodePage() {
  const status = featureFlags.codeWorkspace ? "Preview" : "off";

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Workspace / Code"
        title="Code Workspace"
        description="A look at the coding surface: an explorer, an editor and an output pane. This is a visual preview, not a working editor."
        status={status}
      />
      <WorkspaceClone />
    </div>
  );
}
