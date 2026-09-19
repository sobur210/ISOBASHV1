import { PageHeader } from "@/components/page-header";
import { PlaceholderCard } from "@/components/placeholder-card";
import { SettingsIcon, ShieldIcon } from "@/components/ui/icons";

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Workspace / Settings"
        title="Settings"
        description="A route boundary for account, providers, security, preferences, and workspace configuration."
        status="Phase 8+"
      />
      <PlaceholderCard
        icon={<SettingsIcon className="h-5 w-5" />}
        title="Preferences and provider configuration"
        description="Signature settings will be backed by real persisted configuration once identity and entitlements exist."
        feature="Integrated with auth — Phase 8"
      />
      <PlaceholderCard
        icon={<ShieldIcon className="h-5 w-5" />}
        title="Security settings"
        description="MFA status, active sessions, and session revocation will be managed here with strict audit logging."
        feature="Security requirement — spec §19"
      />
    </div>
  );
}