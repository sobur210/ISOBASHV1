import { PageHeader } from "@/components/page-header";
import { PlaceholderCard } from "@/components/placeholder-card";
import { CreditCardIcon, ShieldIcon } from "@/components/ui/icons";

export default function BillingPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Workspace / Billing"
        title="Plan & billing"
        description="A route boundary for plan management, usage, and payments."
        status="Phase 16"
      />
      <PlaceholderCard
        icon={<CreditCardIcon className="h-5 w-5" />}
        title="No billing data yet"
        description="Plan, limits, and payment management arrive with the billing phase. Until then the page reports real usage from the API where available, and nothing else."
        feature="Integrated in Phase 16"
      />
      <PlaceholderCard
        icon={<ShieldIcon className="h-5 w-5" />}
        title="Admin controls usage"
        description="Admin entitlement governs usage limits. Billing surfaces will render those enforced limits, never placeholder numbers."
        feature="Entitlement-first"
      />
    </div>
  );
}