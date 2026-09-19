import { PageHeader } from "@/components/page-header";
import { PlaceholderCard } from "@/components/placeholder-card";
import { SettingsIcon, ShieldIcon } from "@/components/ui/icons";

export default function AdminSettingsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Admin / Settings"
        title="System settings"
        description="The protected configuration boundary for providers, models, feature flags, and security policies."
        status="Admin auth required"
      />
      <PlaceholderCard
        icon={<SettingsIcon className="h-5 w-5" />}
        title="No system configuration yet"
        description="Provider keys, model routing, entitlements, and feature flags will be managed here from persisted configuration."
        feature="Integrated in Phase 17 — admin center"
      />
      <PlaceholderCard
        icon={<ShieldIcon className="h-5 w-5" />}
        title="Limits for users, never the admin"
        description="Normal-user limits will be configurable here without ever restricting admin application access."
        feature="Security requirement — spec §3"
      />
    </div>
  );
}