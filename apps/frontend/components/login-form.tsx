"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { submitCredentials, verifyMfaToken } from "@/lib/auth-client";
import { AlertTriangleIcon } from "@/components/ui/icons";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

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
    <>
      {error ? (
        <div
          role="alert"
          className="mt-6 flex items-start gap-3 rounded-xl border border-danger/25 bg-danger/8 px-4 py-3"
        >
          <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          <p className="text-[13.5px] text-foreground">{error}</p>
        </div>
      ) : null}

      <form
        onSubmit={(event) => void submit(event)}
        className="edge-light mt-8 space-y-4 rounded-2xl border border-border bg-surface p-6 shadow-soft"
      >
        {mfaToken ? (
          <Field
            label="Authenticator code"
            htmlFor="mfa-code"
            hint="6 digits from your authenticator app."
          >
            <Input
              id="mfa-code"
              type="text"
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              pattern="[0-9]{6}"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
              className="font-mono tracking-[0.3em]"
            />
          </Field>
        ) : (
          <>
            <Field label="Email" htmlFor="email">
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </Field>
            <Field label="Password" htmlFor="password">
              <Input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
              />
            </Field>
          </>
        )}

        <Button
          type="submit"
          className="w-full"
          disabled={pending || (mfaToken ? code.length !== 6 : !email || !password)}
        >
          {pending ? "Verifying…" : mfaToken ? "Verify & sign in" : "Sign in"}
        </Button>

        {mfaToken ? (
          <button
            type="button"
            onClick={() => setMfaToken(null)}
            className="w-full text-[13px] text-muted-foreground transition-colors hover:text-foreground"
          >
            ← Back to sign in
          </button>
        ) : (
          <p className="text-[13px] text-muted-foreground">
            No account yet?{" "}
            <Link href="/register" className="font-medium text-primary hover:underline">
              Create one
            </Link>
          </p>
        )}
      </form>

      <ButtonLink href="/" variant="ghost" size="sm" className="mt-4 w-full">
        Back to home
      </ButtonLink>
    </>
  );
}
