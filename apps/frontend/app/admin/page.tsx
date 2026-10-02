import { PageHeader } from "@/components/page-header";
import { AdminOverviewPanel } from "@/components/admin-overview-panel";
import { SystemHealthPanel } from "@/components/system-health-panel";

export default function AdminPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Admin"
        title="Control center"
        description="Live counts for the whole deployment, what it is configured to do, and a system status check that is measured on every load rather than hardcoded."
        status="Admin session active"
      />

      <AdminOverviewPanel />

      <section aria-labelledby="system-health-heading">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.24em] text-muted-foreground">
              System status
            </p>
            <h2 id="system-health-heading" className="mt-1 text-lg font-semibold text-foreground">
              Platform status
            </h2>
          </div>
        </div>
        <SystemHealthPanel />
      </section>
    </div>
  );
}