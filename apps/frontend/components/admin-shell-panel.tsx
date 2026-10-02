"use client";

import { useState } from "react";
import { sendJsonAuthed } from "@/lib/api";

type ShellResponse = {
  ok: boolean;
  blocked: boolean;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  reason?: string;
};

export function AdminShellPanel() {
  const [command, setCommand] = useState("pwd");
  const [response, setResponse] = useState<ShellResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const runCommand = async () => {
    setRunning(true);
    setError(null);
    try {
      const result = await sendJsonAuthed<ShellResponse>("/admin/shell/exec", { command }, "POST");
      setResponse(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The shell command could not be run.");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-surface-2 p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.24em] text-muted-foreground">
            Admin shell
          </p>
          <h3 className="mt-1 text-base font-semibold text-foreground">Safe diagnostics runner</h3>
        </div>
        <span className="rounded-full border border-accent/30 bg-accent-soft px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-accent">
          Read-only
        </span>
      </div>

      <div className="space-y-3">
        <label className="block text-sm font-medium text-foreground" htmlFor="admin-shell-command">
          Command
        </label>
        <textarea
          id="admin-shell-command"
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          rows={3}
          className="w-full rounded-xl border border-border bg-[color:var(--surface)] px-3 py-2 text-sm text-foreground outline-none ring-0 placeholder:text-muted-foreground focus:border-accent"
          placeholder="pwd"
        />

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={runCommand}
            disabled={running || !command.trim()}
            className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            {running ? "Running…" : "Run command"}
          </button>
          <p className="text-xs text-muted-foreground">
            Allowed: process information, repo status, and simple file listing. No pipes, redirects, or destructive actions.
          </p>
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{error}</div>
      ) : null}

      {response ? (
        <div className="mt-4 space-y-3 rounded-xl border border-border bg-background/60 p-3">
          <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.18em] text-muted-foreground">
            <span>Result</span>
            <span className={response.ok ? "text-success" : "text-danger"}>
              {response.ok ? "OK" : response.blocked ? "BLOCKED" : "FAILED"}
            </span>
          </div>
          <div className="text-xs text-muted-foreground">Command: {response.command}</div>
          <pre className="max-h-56 overflow-auto rounded-lg border border-border bg-surface-2 p-3 text-xs text-foreground whitespace-pre-wrap">
            {response.stdout || response.stderr || response.reason || "No output."}
          </pre>
          <div className="text-xs text-muted-foreground">Exit code: {response.exitCode ?? "n/a"}</div>
        </div>
      ) : null}
    </div>
  );
}
