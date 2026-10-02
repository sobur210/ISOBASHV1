import { PageHeader } from "@/components/page-header";
import { AdminUsersPanel } from "@/components/admin-users-panel";

export default function AdminUsersPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Admin / Users"
        title="Users"
        description="Every registered account, with the three operations an administrator actually performs: change a role, grant or withdraw a plan, and revoke sessions. Each one is authorized and audited server-side."
        status="Admin auth required"
      />
      <AdminUsersPanel />
    </div>
  );
}