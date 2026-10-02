import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { FilesPanel } from "@/components/files-panel";
import { requireUser } from "@/lib/auth-server";
import { featureVisible } from "@/lib/feature-flags";

/**
 * Phase 1: Files is retired in favour of the Code Workspace.
 *
 * Same contract as Projects: the uploads, chunks and embeddings stay in the
 * database and nothing is deleted, but the route is unreachable while the flag
 * is off, and `FeatureGuard` refuses `/files` and `/knowledge` to match.
 */
export default async function FilesPage() {
  const user = await requireUser();
  if (!featureVisible("files", user.role)) {
    redirect("/app");
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Workspace / Files"
        title="Files & knowledge"
        description="Uploads are validated by size, extension, byte signature and UTF-8 validity, then parsed for real. Keyword search always works; vector search runs when an embedding model actually answers, and says so."
        status="Retiring · superseded by Code"
      />
      <FilesPanel />
    </div>
  );
}