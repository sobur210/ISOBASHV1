import { PageHeader } from "@/components/page-header";
import { PlaceholderCard } from "@/components/placeholder-card";
import { HomeIcon, ShieldIcon } from "@/components/ui/icons";

export default function AdminPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Admin"
        title="Control center"
        description="The protected administration boundary for users, entitlements, providers, jobs, security, and audit events."
        status="Admin auth required"
      />
      <div className="grid gap-5 md:grid-cols-2">
        <PlaceholderCard
          icon={<HomeIcon className="h-5 w-5" />}
          title="System overview"
          description="Queue health, provider status, usage, and entitlement configuration will be summarized here from real backend data."
          feature="Boundary only — no fake data"
        />
        <PlaceholderCard
          icon={<ShieldIcon className="h-5 w-5" />}
          title="Restricted boundary"
          description="Every operation in this area will be authorization-checked server-side and fully audit-logged. MFA is required for admin access."
          feature="Security requirement — spec §19.1"
        />
      </div>
    </div>
  );
}