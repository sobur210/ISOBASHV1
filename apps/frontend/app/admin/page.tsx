import { AdminPageHeader } from "@/components/admin/page-header";
import { AdminOverviewPanel } from "@/components/admin-overview-panel";
import { SystemHealthPanel } from "@/components/system-health-panel";

export default function AdminPage() {
  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Admin"
        title="Control center"
        description="Live counts for the whole deployment, what it is configured to do, and a status check that is measured against the running stack on every load rather than hardcoded."
      />

      <AdminOverviewPanel />

      <section aria-labelledby="system-health-heading" className="space-y-3">
        <div>
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Platform status
          </p>
          <h2 id="system-health-heading" className="mt-1 text-[15px] font-semibold text-foreground">
            Live component health
          </h2>
        </div>
        <SystemHealthPanel />
      </section>
    </div>
  );
}