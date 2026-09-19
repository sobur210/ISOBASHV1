import { SectionShell } from "@/components/section-shell";

export default function AdminUsersPage() {
  return <SectionShell eyebrow="Admin / Users" title="Users" description="The protected user-management boundary. Role changes will require backend authorization and audit logging." status="Admin auth required" />;
}
