"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogoutIcon } from "@/components/ui/icons";
import { apiUrl } from "@/lib/auth";

export function SignOutButton({ className = "" }: { className?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const signOut = async () => {
    if (pending) return;
    setPending(true);
    try {
      await fetch(`${apiUrl()}/auth/logout`, { method: "POST", credentials: "include" });
    } finally {
      router.push("/login");
      router.refresh();
    }
  };

  return (
    <button
      type="button"
      onClick={() => void signOut()}
      disabled={pending}
      aria-label="Sign out"
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-danger/50 hover:text-danger disabled:opacity-50 ${className}`}
    >
      <LogoutIcon className="h-4 w-4" />
    </button>
  );
}