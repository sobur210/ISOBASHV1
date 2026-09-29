import { PageHeader } from "@/components/page-header";
import { FilesPanel } from "@/components/files-panel";

export default function FilesPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Workspace / Files"
        title="Files & knowledge"
        description="Uploads are validated by size, extension, byte signature and UTF-8 validity, then parsed for real. Keyword search always works; vector search runs when an embedding model actually answers, and says so."
        status="Phase 12"
      />
      <FilesPanel />
    </div>
  );
}
