"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { submitCredentials } from "@/lib/auth-client";
import { AlertTriangleIcon } from "@/components/ui/icons";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

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
        <Field label="Name" htmlFor="name" hint="Optional. Shown on your workspace.">
          <Input
            id="name"
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ada Lovelace"
          />
        </Field>

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

        <Field label="Password" htmlFor="password" hint="At least 8 characters.">
          <Input
            id="password"
            type="password"
            required
            autoComplete="new-password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </Field>

        <Button
          type="submit"
          className="w-full"
          disabled={pending || !email || password.length < 8}
        >
          {pending ? "Creating account…" : "Create account"}
        </Button>

        <p className="text-[13px] text-muted-foreground">
          Already registered?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </form>

      <ButtonLink href="/" variant="ghost" size="sm" className="mt-4 w-full">
        Back to home
      </ButtonLink>
    </>
  );
}
