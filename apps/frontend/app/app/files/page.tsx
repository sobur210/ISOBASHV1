import { PageHeader } from "@/components/page-header";
import { PlaceholderCard } from "@/components/placeholder-card";
import { DatabaseIcon, FileIcon } from "@/components/ui/icons";

export default function FilesPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Workspace / Files"
        title="Files"
        description="A route boundary for secure uploads, document processing, permissions, embeddings, and knowledge retrieval."
        status="Phase 12"
      />
      <PlaceholderCard
        icon={<FileIcon className="h-5 w-5" />}
        title="No files yet"
        description="Files will be validated for size, MIME, signature, and traversal before storage, then parsed and indexed."
        feature="Integrated in Phase 12 — files & documents"
      />
      <PlaceholderCard
        icon={<DatabaseIcon className="h-5 w-5" />}
        title="Knowledge pipeline"
        description="Document parsing, OCR where appropriate, embeddings, and RAG retrieval feed the local knowledge base."
        feature="Security requirement — spec §17"
      />
    </div>
  );
}