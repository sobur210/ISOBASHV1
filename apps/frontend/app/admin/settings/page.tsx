import { AdminShellPanel } from "@/components/admin-shell-panel";
import { AdminOverviewPanel } from "@/components/admin-overview-panel";
import { PageHeader } from "@/components/page-header";

export default function AdminSettingsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Admin / Settings"
        title="System settings"
        description="What this deployment is actually configured to do: providers and whether their credentials are present, the storage roots, the enforced limits, and the queue state. Read-only by design, because every one of these is environment-driven."
        status="Admin auth required"
      />
      <AdminShellPanel />
      <AdminOverviewPanel section="settings" />
    </div>
  );
}