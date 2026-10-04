import { AdminPageHeader } from "@/components/admin/page-header";
import { EmptyState, Panel, PanelBody, PanelHeader, SectionLabel } from "@/components/admin/ui";
import { ChartIcon } from "@/components/ui/icons";

/**
 * This route is an authorised boundary, not a dashboard. There is no metrics
 * store behind it yet, so it says exactly that and names the sources the numbers
 * will come from. Rendering invented charts here would be the one thing an admin
 * console must never do.
 */
const planned = [
  { label: "Request volume and latency", source: "Per-request records with a resolved route and status" },
  { label: "Job throughput and queue depth", source: "Redis queue counts over time, per queue" },
  { label: "Provider health and error rates", source: "Existing provider health and circuit-breaker state" },
  { label: "Error and failure trends", source: "Typed error codes emitted by the API error filter" },
];

export default function AdminAnalyticsPage() {
  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Admin / Analytics"
        title="Analytics"
        description="The protected operational boundary for usage, jobs, provider health, and system events."
      />

      <Panel>
        <PanelHeader
          title="Not aggregated yet"
          description="Nothing on this screen is simulated. These are the series that will exist here, and where each one comes from."
          icon={<ChartIcon className="h-4 w-4" />}
        />
        <PanelBody className="space-y-4">
          <EmptyState
            title="No metrics store is wired up"
            description="There is no time-series source behind this route yet, so there is nothing truthful to plot. Until one exists, this page stays empty rather than showing sample numbers."
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <SectionLabel>Planned series</SectionLabel>
              <ul className="mt-2 grid gap-2">
                {planned.map((item) => (
                  <li key={item.label} className="rounded-lg border border-border px-3 py-2.5">
                    <p className="text-[12.5px] font-medium text-foreground">{item.label}</p>
                    <p className="mt-0.5 text-[11.5px] leading-5 text-muted-foreground">{item.source}</p>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <SectionLabel>Available today</SectionLabel>
              <ul className="mt-2 grid gap-2">
                {[
                  "Account and content counts on the control center",
                  "Queue counts and worker count under Configuration",
                  "Live component health with per-check latency",
                  "The audit trail behind every admin mutation",
                ].map((item) => (
                  <li
                    key={item}
                    className="rounded-lg border border-border px-3 py-2.5 text-[12.5px] text-muted-foreground"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </PanelBody>
      </Panel>
    </div>
  );
}