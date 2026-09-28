"use client";

import { useState } from "react";
import { apiUrl } from "@/lib/auth";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatusChip } from "@/components/ui/status-chip";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { AlertTriangleIcon, CheckIcon, ShieldIcon } from "@/components/ui/icons";

type MfaPayload = { error?: { message?: string; code?: string } };

type Props = {
  email: string;
  mfaEnabled: boolean;
};

export function MfaSettings({ email, mfaEnabled: initialEnabled }: Props) {
  const [mfaEnabled, setMfaEnabled] = useState(initialEnabled);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [otpauth, setOtpauth] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setPassword("");
    setCode("");
    setError(null);
    setMessage(null);
  };

  const setup = async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`${apiUrl()}/auth/mfa/setup`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const payload = (await res.json()) as { secret?: string; otpauthUrl?: string } & MfaPayload;
      if (!res.ok) {
        setError(payload.error?.message ?? "Setup failed.");
        return;
      }
      setSecret(payload.secret ?? null);
      setOtpauth(payload.otpauthUrl ?? null);
      setPassword("");
    } finally {
      setPending(false);
    }
  };

  const enable = async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`${apiUrl()}/auth/mfa/enable`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const payload = (await res.json()) as { ok?: boolean } & MfaPayload;
      if (!res.ok) {
        setError(payload.error?.message ?? "Enable failed.");
        return;
      }
      setMfaEnabled(true);
      setSecret(null);
      setOtpauth(null);
      setCode("");
      setMessage("Multi-factor authentication is now enabled for your account.");
    } finally {
      setPending(false);
    }
  };

  const disable = async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`${apiUrl()}/auth/mfa/disable`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const payload = (await res.json()) as { ok?: boolean } & MfaPayload;
      if (!res.ok) {
        setError(payload.error?.message ?? "Disable failed.");
        return;
      }
      setMfaEnabled(false);
      setCode("");
      setMessage("Multi-factor authentication has been disabled.");
    } finally {
      setPending(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Multi-factor authentication"
        subtitle={
          mfaEnabled
            ? "Enabled. Every sign-in now requires a 6-digit code from your authenticator app."
            : "Add a second factor to protect your account. A time-based one-time password (TOTP) from any authenticator app is verified server-side."
        }
        icon={<ShieldIcon className="h-4 w-4" />}
        action={
          <StatusChip tone={mfaEnabled ? "success" : "neutral"} label={mfaEnabled ? "enabled" : "disabled"} />
        }
      />

      <CardBody>
        {message ? (
          <p
            role="status"
            className="mb-5 flex items-start gap-3 rounded-xl border border-success/25 bg-success/5 px-4 py-3 text-[13.5px] text-foreground"
          >
            <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            {message}
          </p>
        ) : null}
        {error ? (
          <div
            role="alert"
            className="mb-5 flex items-start gap-3 rounded-xl border border-danger/25 bg-danger/5 px-4 py-3"
          >
            <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
            <p className="text-[13.5px] text-foreground">{error}</p>
          </div>
        ) : null}

        {!mfaEnabled ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Confirm your password" htmlFor="mfa-password" className="min-w-64 flex-1">
                <Input
                  id="mfa-password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Your account password"
                  value={password}
                  onChange={(e) => {
                    reset();
                    setPassword(e.target.value);
                  }}
                />
              </Field>
              <Button onClick={() => void setup()} disabled={pending || !password}>
                {pending ? "Working…" : "Set up"}
              </Button>
            </div>

            {secret && otpauth ? (
              <div className="edge-light space-y-4 rounded-xl border border-accent/25 bg-accent-soft/50 p-5">
                <p className="text-[13.5px] leading-6 text-muted-foreground">
                  Scan this URI with your authenticator app, or enter the secret manually for{" "}
                  <span className="font-medium text-foreground">{email}</span>:
                </p>

                <Field label="otpauth URI" htmlFor="mfa-otpauth">
                  <Input
                    id="mfa-otpauth"
                    readOnly
                    value={otpauth}
                    onFocus={(e) => e.target.select()}
                    className="font-mono text-xs"
                  />
                </Field>

                <Field label="Manual secret" htmlFor="mfa-secret">
                  <Input
                    id="mfa-secret"
                    readOnly
                    value={secret}
                    onFocus={(e) => e.target.select()}
                    className="font-mono text-xs"
                  />
                </Field>

                <div className="flex flex-wrap items-end gap-3">
                  <Field label="6-digit code" htmlFor="mfa-enable-code" className="w-44">
                    <Input
                      id="mfa-enable-code"
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      pattern="[0-9]{6}"
                      placeholder="000000"
                      value={code}
                      onChange={(e) => {
                        setError(null);
                        setCode(e.target.value);
                      }}
                    />
                  </Field>
                  <Button onClick={() => void enable()} disabled={pending || code.length !== 6}>
                    Enable
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground">
                  Enabling rotates every other active session — other devices will need to sign in again.
                </p>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Current 6-digit code" htmlFor="mfa-disable-code" className="w-44">
              <Input
                id="mfa-disable-code"
                type="text"
                inputMode="numeric"
                maxLength={6}
                pattern="[0-9]{6}"
                placeholder="000000"
                value={code}
                onChange={(e) => {
                  setError(null);
                  setCode(e.target.value);
                }}
              />
            </Field>
            <Button variant="danger" onClick={() => void disable()} disabled={pending || code.length !== 6}>
              Disable
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
