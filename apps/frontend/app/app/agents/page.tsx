import { PageHeader } from "@/components/page-header";
import { AgentsPanel } from "@/components/agents-panel";

export default function AgentsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Workspace / Agents"
        title="Agents"
        description="Each run is planned and executed on the server against a real provider. The plan, every step and the output are stored, and an open run can be cancelled."
        status="Phase 10 · live"
      />
      <AgentsPanel />
    </div>
  );
}
