"use client";

import { useState } from "react";
import { sendJsonAuthed } from "@/lib/api";
import { Console, ActionButton, Notice, Panel, PanelBody, PanelHeader } from "@/components/admin/ui";
import { StatusChip } from "@/components/ui/status-chip";
import { PlayIcon, TerminalIcon } from "@/components/ui/icons";

type ShellResponse = {
  ok: boolean;
  blocked: boolean;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  reason?: string;
};

const EXAMPLES = ["pwd", "node --version", "git status --short", "ls -la"];

/**
 * The admin-only diagnostics runner, presented as a terminal rather than a form
 * with a result box under it: the command, its verdict and its output belong in
 * one object, in reading order.
 */
export function AdminShellPanel() {
  const [command, setCommand] = useState("pwd");
  const [response, setResponse] = useState<ShellResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const runCommand = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || running) return;
    setRunning(true);
    setError(null);
    sendJsonAuthed<ShellResponse>("/admin/shell/exec", { command: trimmed }, "POST")
      .then((result) => setResponse(result))
      .catch((err) => setError(err instanceof Error ? err.message : "The shell command could not be run."))
      .finally(() => setRunning(false));
  };

  return (
    <Panel>
      <PanelHeader
        title="Diagnostics runner"
        description="A read-only shell: process information, repo status and simple listings. No pipes, redirects or destructive actions."
        icon={<TerminalIcon className="h-4 w-4" />}
        meta={<StatusChip tone="warning" label="read-only" />}
      />
      <PanelBody className="space-y-3">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            runCommand(command);
          }}
        >
          <label htmlFor="admin-shell-command" className="sr-only">
            Command
          </label>
          <div className="flex items-stretch gap-2">
            <span
              aria-hidden="true"
              className="flex select-none items-center rounded-lg border border-border bg-surface-2 px-3 font-mono text-[12px] text-accent"
            >
              $
            </span>
            <input
              id="admin-shell-command"
              value={command}
              onChange={(event) => setCommand(event.target.value)}
              spellCheck={false}
              autoComplete="off"
              className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 font-mono text-[12.5px] text-foreground transition-colors placeholder:text-muted-foreground/70 hover:border-border-strong focus:border-primary/60 focus:outline-none"
              placeholder="pwd"
            />
            <ActionButton
              onClick={() => runCommand(command)}
              disabled={running || !command.trim()}
              icon={<PlayIcon className={`h-3.5 w-3.5 ${running ? "animate-pulse" : ""}`} />}
              className="h-10 border border-primary/40 bg-primary-soft px-3.5 text-primary hover:bg-primary hover:text-primary-foreground"
            >
              {running ? "Running" : "Run"}
            </ActionButton>
          </div>
        </form>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
            Try
          </span>
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => {
                setCommand(example);
                runCommand(example);
              }}
              className="rounded-md border border-border bg-surface-2 px-2 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
            >
              {example}
            </button>
          ))}
        </div>

        {error ? <Notice tone="danger">{error}</Notice> : null}

        {response ? (
          <Console
            command={response.command}
            tone={response.ok ? "ok" : response.blocked ? "blocked" : "failed"}
            lines={response.stdout || response.stderr || response.reason || "No output."}
          />
        ) : null}
      </PanelBody>
      {response ? (
        <footer className="border-t border-border px-5 py-3 font-mono text-[11px] text-muted-foreground">
          exit code {response.exitCode ?? "n/a"}
        </footer>
      ) : null}
    </Panel>
  );
}