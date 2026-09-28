import { PageHeader } from "@/components/page-header";
import { ResearchPanel } from "@/components/research-panel";

export default function ResearchPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Workspace / Research"
        title="Web research"
        description="Retrieval-backed answers. The server fetches the pages, reads them, and every citation is checked against the text it came from."
        status="Phase 11"
      />
      <ResearchPanel />
    </div>
  );
}
