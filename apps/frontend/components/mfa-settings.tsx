"use client";

import { useState } from "react";
import { apiUrl } from "@/lib/auth";
import { AlertTriangleIcon, ShieldIcon } from "@/components/ui/icons";

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
    <div className="rounded-2xl border border-border bg-surface p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.24em] text-accent">
            <ShieldIcon className="h-3.5 w-3.5" />
            Security
          </p>
          <h2 className="mt-3 text-lg font-semibold tracking-[-0.01em] text-foreground">
            Multi-factor authentication
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            {mfaEnabled
              ? "Enabled. Every sign-in now requires a 6-digit code from your authenticator app."
              : "Add a second factor to protect your account. A time-based one-time password (TOTP) from any authenticator app is verified server-side."}
          </p>
        </div>
        <span
          className={`rounded-full border px-3 py-1 font-mono text-xs ${
            mfaEnabled ? "border-success/40 bg-success/5 text-success" : "border-border/60 bg-muted/30 text-muted-foreground"
          }`}
        >
          {mfaEnabled ? "Enabled" : "Disabled"}
        </span>
      </div>

      {message ? (
        <p className="mt-4 rounded-xl border border-success/25 bg-success/5 px-4 py-3 text-sm text-foreground">{message}</p>
      ) : null}
      {error ? (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-danger/25 bg-danger/5 px-4 py-3">
          <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          <p className="text-sm text-foreground">{error}</p>
        </div>
      ) : null}

      {!mfaEnabled && (
        <>
          <div className="mt-6 grid max-w-md grid-cols-[1fr_auto] gap-3">
            <input
              type="password"
              autoComplete="current-password"
              placeholder="Confirm your password to continue"
              value={password}
              onChange={(e) => {
                reset();
                setPassword(e.target.value);
              }}
              className="w-full rounded-xl border border-foreground/10 bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <button
              onClick={() => void setup()}
              disabled={pending || !password}
              className="rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover disabled:pointer-events-none disabled:opacity-50"
            >
              Set up
            </button>
          </div>

          {secret && otpauth ? (
            <div className="mt-6 space-y-4 rounded-xl border border-accent/25 bg-accent-soft/40 p-5">
              <p className="text-sm leading-6 text-muted-foreground">
                Scan this URI with your authenticator app, or enter the secret manually for{" "}
                <span className="font-medium text-foreground">{email}</span>:
              </p>
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">otpauth URI</span>
                <input
                  readOnly
                  value={otpauth}
                  onFocus={(e) => e.target.select()}
                  className="mt-1.5 w-full rounded-lg border border-foreground/10 bg-background px-3 py-2 font-mono text-xs text-muted-foreground focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">Manual secret</span>
                <input
                  readOnly
                  value={secret}
                  onFocus={(e) => e.target.select()}
                  className="mt-1.5 w-full rounded-lg border border-foreground/10 bg-background px-3 py-2 font-mono text-xs text-foreground focus:outline-none"
                />
              </label>
              <div className="grid max-w-sm grid-cols-[1fr_auto] gap-3">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  pattern="[0-9]{6}"
                  placeholder="6-digit code"
                  value={code}
                  onChange={(e) => {
                    setError(null);
                    setCode(e.target.value);
                  }}
                  className="w-full rounded-xl border border-foreground/10 bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <button
                  onClick={() => void enable()}
                  disabled={pending || code.length !== 6}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover disabled:pointer-events-none disabled:opacity-50"
                >
                  Enable
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Enabling rotates every other active session — other devices will need to sign in again.
              </p>
            </div>
          ) : null}
        </>
      )}

      {mfaEnabled && (
        <div className="mt-6 grid max-w-md grid-cols-[1fr_auto] gap-3">
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            pattern="[0-9]{6}"
            placeholder="Current 6-digit code"
            value={code}
            onChange={(e) => {
              setError(null);
              setCode(e.target.value);
            }}
            className="w-full rounded-xl border border-foreground/10 bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <button
            onClick={() => void disable()}
            disabled={pending || code.length !== 6}
            className="rounded-full border border-danger/40 px-5 py-2.5 text-sm font-medium text-danger transition-colors hover:bg-danger/10 disabled:pointer-events-none disabled:opacity-50"
          >
            Disable
          </button>
        </div>
      )}
    </div>
  );
}