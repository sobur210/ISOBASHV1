import type { Metadata } from "next";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "@/components/login-form";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your ISOBASH workspace.",
};

export default function LoginPage() {
  return (
    <AuthShell
      title="Sign in"
      description="Sign in to your ISOBASH workspace. Your session is server-managed and expires after 30 days."
    >
      <LoginForm />
    </AuthShell>
  );
}
