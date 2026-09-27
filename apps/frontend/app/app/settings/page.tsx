import { PageHeader } from "@/components/page-header";
import { MfaSettings } from "@/components/mfa-settings";
import { requireUser } from "@/lib/auth-server";
import { SettingsIcon } from "@/components/ui/icons";

export default async function SettingsPage() {
  const user = await requireUser();

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Workspace / Settings"
        title="Settings"
        description="Account security, providers, preferences, and workspace configuration."
        status="Phase 8"
      />
      <MfaSettings email={user.email} mfaEnabled={user.mfaEnabled} />
      <div className="rounded-2xl border border-border bg-surface p-6">
        <p className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.24em] text-accent">
          <SettingsIcon className="h-3.5 w-3.5" />
          Preferences
        </p>
        <h2 className="mt-3 text-lg font-semibold tracking-[-0.01em] text-foreground">Provider configuration</h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
          Model and provider preferences will be backed by real persisted configuration in a later phase.
        </p>
      </div>
    </div>
  );
}