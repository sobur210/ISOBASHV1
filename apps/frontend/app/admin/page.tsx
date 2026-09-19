import { SectionShell } from "@/components/section-shell";

export default function AdminPage() {
  return <SectionShell eyebrow="Admin" title="Control center" description="The protected administration boundary for users, entitlements, providers, jobs, security, and audit events." status="Admin auth required" />;
}
