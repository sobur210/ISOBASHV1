import { PageHeader } from "@/components/page-header";
import { BillingPanel } from "@/components/billing-panel";

export default function BillingPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Workspace / Billing"
        title="Plan & billing"
        description="The plan this account holds, measured usage against the limits that are actually enforced, and an honest answer about payment: no processor is configured, so nothing here can be charged."
        status="Phase 16"
      />
      <BillingPanel />
    </div>
  );
}