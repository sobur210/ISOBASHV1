import type { Metadata } from "next";
import { AuthShell } from "@/components/auth-shell";
import { RegisterForm } from "@/components/register-form";

export const metadata: Metadata = {
  title: "Create account",
  description: "Create your ISOBASH account and workspace.",
};

export default function RegisterPage() {
  return (
    <AuthShell
      title="Create your account"
      description="One account, one workspace. Registration is open during development."
    >
      <RegisterForm />
    </AuthShell>
  );
}
