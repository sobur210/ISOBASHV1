"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { submitCredentials } from "@/lib/auth-client";
import { AlertTriangleIcon } from "@/components/ui/icons";

export function RegisterForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    const result = await submitCredentials("/auth/register", { email, password, name });
    if ("error" in result) {
      setError(result.error);
      setPending(false);
      return;
    }
    router.push("/app");
    router.refresh();
  };

  return (
    <div className="w-full max-w-md">
      <p className="font-mono text-xs uppercase tracking-[0.24em] text-accent">ISOBASH access</p>
      <h1 className="mt-4 text-4xl font-semibold tracking-[-0.02em] text-foreground">Create your account</h1>
      <p className="mt-4 leading-7 text-muted-foreground">
        One account, one workspace. Registration is open during development.
      </p>

      {error ? (
        <div className="mt-6 flex items-start gap-3 rounded-xl border border-danger/25 bg-danger/5 px-4 py-3">
          <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          <p className="text-sm text-foreground">{error}</p>
        </div>
      ) : null}

      <form
        onSubmit={(event) => void submit(event)}
        className="mt-8 space-y-4 rounded-2xl border border-border bg-surface p-6"
      >
        <label className="block">
          <span className="text-sm font-medium text-foreground">Name</span>
          <input
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-foreground/10 bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/20"
            placeholder="Optional"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-foreground">Email</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-foreground/10 bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/20"
            placeholder="you@example.com"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-foreground">Password</span>
          <input
            type="password"
            required
            autoComplete="new-password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-foreground/10 bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/20"
            placeholder="At least 8 characters"
          />
        </label>
        <button
          type="submit"
          disabled={pending || !email || password.length < 8}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover disabled:pointer-events-none disabled:opacity-50"
        >
          {pending ? "Creating account…" : "Create account"}
        </button>
        <p className="text-sm text-muted-foreground">
          Already registered?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </form>

      <div className="mt-6 flex gap-3">
        <Link
          href="/"
          className="inline-flex flex-1 items-center justify-center rounded-full border border-border px-5 py-2.5 text-sm text-foreground transition-colors hover:border-primary/60 hover:text-primary"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}