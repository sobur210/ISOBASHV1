import { PageHeader } from "@/components/page-header";
import { PlaceholderCard } from "@/components/placeholder-card";
import { SearchIcon, SparklesIcon } from "@/components/ui/icons";

export default function ResearchPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Workspace / Research"
        title="Web research"
        description="A route boundary for retrieval-backed research with sources and structured citations."
        status="Phase 11"
      />
      <PlaceholderCard
        icon={<SearchIcon className="h-5 w-5" />}
        title="No research sessions yet"
        description="Research will combine web retrieval with the reasoning engine to produce sourced answers. Nothing here is simulated until that phase lands."
        feature="Integrated in Phase 11"
      />
      <PlaceholderCard
        icon={<SparklesIcon className="h-5 w-5" />}
        title="Readiness"
        description="The research capability currently reports 'unavailable' through the API because no provider is configured to power it. That status updates automatically once a research-capable provider is added."
        feature="Live via /ai/capabilities"
      />
    </div>
  );
}