import { PageHeader } from "@/components/page-header";
import { PlaceholderCard } from "@/components/placeholder-card";
import { ShieldIcon, UsersIcon } from "@/components/ui/icons";

export default function AdminUsersPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Admin / Users"
        title="Users"
        description="The protected user-management boundary. Role changes will require backend authorization and audit logging."
        status="Admin auth required"
      />
      <PlaceholderCard
        icon={<UsersIcon className="h-5 w-5" />}
        title="No user directory yet"
        description="User records exist since authentication (Phase 6). Directory views and role changes arrive with the authorization phase and will be authorization-checked and logged."
        feature="Integrated in Phase 8: user management"
      />
      <PlaceholderCard
        icon={<ShieldIcon className="h-5 w-5" />}
        title="Admin entitlements are server-decided"
        description="The frontend will never decide who is an admin. Roles and entitlements are resolved from the backend on every request."
        feature="Security requirement: spec §5"
      />
    </div>
  );
}