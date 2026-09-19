import { PageHeader } from "@/components/page-header";
import { PlaceholderCard } from "@/components/placeholder-card";
import { ChartIcon, DatabaseIcon } from "@/components/ui/icons";

export default function AdminAnalyticsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Admin / Analytics"
        title="Analytics"
        description="The protected operational analytics boundary for usage, jobs, provider health, and system events."
        status="Admin auth required"
      />
      <PlaceholderCard
        icon={<ChartIcon className="h-5 w-5" />}
        title="No analytics yet"
        description="Usage, job throughput, provider health, and error rates will be aggregated from real observability data."
        feature="Integrated in Phase 31 — observability"
      />
      <PlaceholderCard
        icon={<DatabaseIcon className="h-5 w-5" />}
        title="Structured and truthful"
        description="Every metric will come from real request, job, and error streams. Nothing is simulated on this screen."
        feature="Boundary only — no fake data"
      />
    </div>
  );
}