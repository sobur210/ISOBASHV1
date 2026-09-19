import { SectionShell } from "@/components/section-shell";

export default function AdminSettingsPage() {
  return <SectionShell eyebrow="Admin / Settings" title="System settings" description="The protected configuration boundary for providers, models, feature flags, and security policies." status="Admin auth required" />;
}
