import { AdminPageHeader } from "@/components/admin/page-header";
import { AdminShellPanel } from "@/components/admin-shell-panel";
import { AdminOverviewPanel } from "@/components/admin-overview-panel";

export default function AdminSettingsPage() {
  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Admin / Configuration"
        title="Configuration"
        description="What this deployment is actually configured to do: providers and whether their credentials are present, the storage roots, the enforced limits, and the queue state. Read-only by design, because every one of these is environment-driven."
      />
      <AdminShellPanel />
      <AdminOverviewPanel section="settings" />
    </div>
  );
}