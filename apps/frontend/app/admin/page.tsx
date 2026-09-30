import { PageHeader } from "@/components/page-header";
import { PlaceholderCard } from "@/components/placeholder-card";
import { SystemHealthPanel } from "@/components/system-health-panel";
import { ShieldIcon } from "@/components/ui/icons";

export default function AdminPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Admin"
        title="Control center"
        description="Administration for users, entitlements, providers, jobs, security, and audit events. System status below is checked live, never hardcoded."
        status="Admin session active"
      />

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

      <div className="grid gap-5 md:grid-cols-2">
        <PlaceholderCard
          icon={<ShieldIcon className="h-5 w-5" />}
          title="Restricted boundary"
          description="Every operation in this area will be authorization-checked server-side and fully audit-logged. MFA is required for admin access."
          feature="Security requirement: spec §19.1"
        />
      </div>
    </div>
  );
}