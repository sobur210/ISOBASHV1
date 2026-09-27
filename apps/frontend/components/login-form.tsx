"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { submitCredentials, verifyMfaToken } from "@/lib/auth-client";
import { AlertTriangleIcon } from "@/components/ui/icons";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);

    if (mfaToken) {
      const result = await verifyMfaToken(mfaToken, code);
      if ("error" in result) {
        setError(result.error);
        setPending(false);
        return;
      }
      router.push("/app");
      router.refresh();
      return;
    }

    const result = await submitCredentials("/auth/login", { email, password });
    if ("error" in result) {
      setError(result.error);
      setPending(false);
      return;
    }
    if ("mfaRequired" in result && result.mfaRequired) {
      setMfaToken(result.mfaToken);
      setPending(false);
      return;
    }
    router.push("/app");
    router.refresh();
  };

  return (
    <div className="w-full max-w-md">
      <p className="font-mono text-xs uppercase tracking-[0.24em] text-accent">ISOBASH access</p>
      <h1 className="mt-4 text-4xl font-semibold tracking-[-0.02em] text-foreground">{mfaToken ? "Confirm sign-in" : "Sign in"}</h1>
      <p className="mt-4 leading-7 text-muted-foreground">
        {mfaToken
          ? "This account uses two-factor authentication. Enter the 6-digit code from your authenticator app."
          : "Sign in to your ISOBASH workspace. Your session is server-managed and expires after 30 days."}
      </p>

      {error ? (
        <div className="mt-6 flex items-start gap-3 rounded-xl border border-danger/25 bg-danger/5 px-4 py-3">
          <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          <p className="text-sm text-foreground">{error}</p>
        </div>
      ) : null}

      <form onSubmit={(event) => void submit(event)} className="mt-8 space-y-4 rounded-2xl border border-border bg-surface p-6">
        {mfaToken ? (
          <label className="block">
            <span className="text-sm font-medium text-foreground">Authenticator code</span>
            <input
              type="text"
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              pattern="[0-9]{6}"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-foreground/10 bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/20"
              placeholder="123456"
            />
          </label>
        ) : (
          <>
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
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-foreground/10 bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="Your password"
              />
            </label>
          </>
        )}
        <button
          type="submit"
          disabled={pending || (mfaToken ? code.length !== 6 : !email || !password)}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover disabled:pointer-events-none disabled:opacity-50"
        >
          {pending ? "Verifying…" : mfaToken ? "Verify & sign in" : "Sign in"}
        </button>
        {mfaToken ? (
          <button
            type="button"
            onClick={() => setMfaToken(null)}
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            ← Back to sign in
          </button>
        ) : (
          <p className="text-sm text-muted-foreground">
            No account yet?{" "}
            <Link href="/register" className="font-medium text-primary hover:underline">
              Create one
            </Link>
          </p>
        )}
      </form>

      <div className="mt-6 flex gap-3">
        <Link href="/" className="inline-flex flex-1 items-center justify-center rounded-full border border-border px-5 py-2.5 text-sm text-foreground transition-colors hover:border-primary/60 hover:text-primary">
          Back to home
        </Link>
      </div>
    </div>
  );
}