import { PageHeader } from "@/components/page-header";
import { PlaceholderCard } from "@/components/placeholder-card";
import { BotIcon, ShieldIcon } from "@/components/ui/icons";

export default function AgentsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Workspace / Agents"
        title="Agents"
        description="A route boundary for agent definitions, instructions, tools, permissions, planning, and execution."
        status="Phase 10"
      />
      <PlaceholderCard
        icon={<BotIcon className="h-5 w-5" />}
        title="No agents yet"
        description="Agents will be real: created, configured, executed, and logged with cancellable jobs and audited tool calls."
        feature="Integrated in Phase 10 — agents & memory"
      />
      <PlaceholderCard
        icon={<ShieldIcon className="h-5 w-5" />}
        title="Governed by default"
        description="Every tool will carry a schema, authorization, validation, timeout, resource limits, and audit logging."
        feature="Security requirement — spec §14"
      />
    </div>
  );
}