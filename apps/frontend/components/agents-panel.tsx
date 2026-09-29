"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/ui/status-chip";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import {
  AlertTriangleIcon,
  BotIcon,
  CheckIcon,
  ClockIcon,
  PlayIcon,
  PlusIcon,
  RefreshIcon,
  TrashIcon,
  CloseIcon,
} from "@/components/ui/icons";
import {
  Agent,
  AgentRun,
  AgentRunStatus,
  AgentStepStatus,
  ProjectSummary,
  cancelAgentRun,
  createAgent,
  deleteAgent,
  fetchAgentRun,
  fetchAgentRuns,
  fetchAgents,
  fetchProjects,
  startAgentRun,
  updateAgent,
} from "@/lib/api";

const toneByRunStatus: Record<AgentRunStatus, BadgeTone> = {
  PENDING: "neutral",
  PLANNING: "primary",
  RUNNING: "primary",
  COMPLETED: "success",
  FAILED: "danger",
  CANCELLED: "neutral",
};

const toneByStepStatus: Record<AgentStepStatus, BadgeTone> = {
  PENDING: "neutral",
  RUNNING: "primary",
  SUCCEEDED: "success",
  FAILED: "danger",
  SKIPPED: "neutral",
};

const TERMINAL: AgentRunStatus[] = ["COMPLETED", "FAILED", "CANCELLED"];
const ACTIVE: AgentRunStatus[] = ["PENDING", "PLANNING", "RUNNING"];

function when(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function AgentsPanel() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [runId, setRunId] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [providerModel, setProviderModel] = useState("");
  const [maxSteps, setMaxSteps] = useState("6");
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [projectId, setProjectId] = useState("");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const active = agents.find((agent) => agent.id === activeId) ?? null;
  const activeRun = runs.find((run) => run.id === runId) ?? runs[0] ?? null;

  const loadAgents = useCallback(async () => {
    try {
      const list = await fetchAgents();
      setAgents(list);
      return list;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Your agents could not be loaded.");
      return [];
    }
  }, []);

  const loadRuns = useCallback(async (agentId: string) => {
    try {
      const list = await fetchAgentRuns(agentId);
      setRuns(list);
      if (list[0]) setRunId(list[0].id);
      return list;
    } catch {
      setRuns([]);
      return [];
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchAgents(controller.signal)
      .then((list) => {
        setAgents(list);
        if (list[0]) setActiveId(list[0].id);
      })
      .catch((err) => {
        if ((err as Error).name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Your agents could not be loaded.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    fetchProjects(controller.signal)
      .then(setProjects)
      .catch(() => setProjects([]));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    // No agent selected means nothing renders the history, so there is no state
    // to clear here and no synchronous setState in this effect.
    if (!activeId) return;
    const controller = new AbortController();
    fetchAgentRuns(activeId, controller.signal)
      .then((list) => {
        setRuns(list);
        setRunId(list[0]?.id ?? null);
      })
      .catch(() => setRuns([]));
    return () => controller.abort();
  }, [activeId]);

  /** A run continues on the server, so poll the open run until it is terminal. */
  const follow = useCallback(
    async (targetRunId: string, agentId: string) => {
      for (let attempt = 0; attempt < 120; attempt += 1) {
        const run = await fetchAgentRun(targetRunId).catch(() => null);
        if (!run) return;
        setRuns((list) => list.map((item) => (item.id === run.id ? run : item)));
        if (TERMINAL.includes(run.status)) {
          await loadRuns(agentId);
          await loadAgents();
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      await loadRuns(agentId);
    },
    [loadAgents, loadRuns],
  );

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const created = await createAgent({
        name: name.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(instructions.trim() ? { instructions: instructions.trim() } : {}),
        ...(providerModel.trim() ? { providerModel: providerModel.trim() } : {}),
        maxSteps: Number(maxSteps) || 6,
        memoryEnabled,
        ...(projectId ? { projectId: Number(projectId) } : {}),
      });
      setName("");
      setDescription("");
      setInstructions("");
      setProviderModel("");
      setActiveId(created.id);
      setNotice(`Created “${created.name}”. It is ready to run.`);
      await loadAgents();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The agent could not be created.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleMemory() {
    if (!active) return;
    setError(null);
    try {
      const updated = await updateAgent(active.id, { memoryEnabled: !active.memoryEnabled });
      setAgents((list) => list.map((item) => (item.id === updated.id ? { ...updated, _count: item._count } : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "The agent could not be updated.");
    }
  }

  async function removeAgent(agent: Agent) {
    setError(null);
    try {
      await deleteAgent(agent.id);
      const list = await loadAgents();
      if (activeId === agent.id) {
        setActiveId(list[0]?.id ?? null);
        setRuns([]);
      }
      setNotice(`Deleted “${agent.name}” and its ${agent._count?.runs ?? 0} run(s).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The agent could not be deleted.");
    }
  }

  async function start(event: FormEvent) {
    event.preventDefault();
    if (!active || !input.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const run = await startAgentRun(active.id, input.trim());
      setInput("");
      setRunId(run.id);
      setNotice("Run started. It is executing on the server.");
      await loadRuns(active.id);
      if (!TERMINAL.includes(run.status)) await follow(run.id, active.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The run could not be started.");
    } finally {
      setBusy(false);
    }
  }

  async function cancel(run: AgentRun) {
    setError(null);
    try {
      const updated = await cancelAgentRun(run.id);
      setRuns((list) => list.map((item) => (item.id === updated.id ? { ...updated, steps: item.steps } : item)));
      setNotice("Cancellation requested. Partial output is kept.");
      await follow(run.id, run.agentId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The run could not be cancelled.");
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="New agent"
          subtitle="An agent plans and executes against a real provider. Leave the model blank to let the router choose."
          icon={<BotIcon className="h-4 w-4" />}
        />
        <CardBody>
          <form onSubmit={create} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" htmlFor="agent-name">
                <Input
                  id="agent-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Release notes writer"
                  maxLength={80}
                />
              </Field>
              <Field label="Model" htmlFor="agent-model" hint="Optional — “provider” or “provider:model”.">
                <Input
                  id="agent-model"
                  value={providerModel}
                  onChange={(event) => setProviderModel(event.target.value)}
                  placeholder="ollama:llama3.2"
                  maxLength={120}
                />
              </Field>
            </div>

            <Field label="Description" htmlFor="agent-description" hint="Optional.">
              <Input
                id="agent-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Turns merged changes into release notes"
                maxLength={500}
              />
            </Field>

            <Field label="Instructions" htmlFor="agent-instructions" hint="Optional — up to 8000 characters.">
              <Textarea
                id="agent-instructions"
                value={instructions}
                onChange={(event) => setInstructions(event.target.value)}
                rows={3}
                placeholder="Summarise each change for a non-technical audience. Never invent a change that is not in the input."
                maxLength={8000}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Max steps" htmlFor="agent-steps">
                <Input
                  id="agent-steps"
                  type="number"
                  min={1}
                  max={12}
                  value={maxSteps}
                  onChange={(event) => setMaxSteps(event.target.value)}
                />
              </Field>
              <Field label="Project" htmlFor="agent-project" hint="Optional.">
                <Select id="agent-project" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
                  <option value="">No project</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Memory" htmlFor="agent-memory">
                <label className="flex h-11 items-center gap-2.5 rounded-xl border border-border bg-surface-2 px-4 text-[13px] text-foreground">
                  <input
                    id="agent-memory"
                    type="checkbox"
                    checked={memoryEnabled}
                    onChange={(event) => setMemoryEnabled(event.target.checked)}
                    className="h-4 w-4 accent-[var(--primary)]"
                  />
                  Read and write memory
                </label>
              </Field>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={!name.trim() || busy}>
                {busy ? "Creating…" : "Create agent"}
                <PlusIcon className="h-3.5 w-3.5" />
              </Button>
            </div>
          </form>

          {notice ? (
            <p className="mt-4 flex items-start gap-2.5 rounded-xl bg-success/10 px-3 py-2 text-xs text-success ring-1 ring-success/20">
              <CheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {notice}
            </p>
          ) : null}
          {error ? (
            <p
              role="alert"
              className="mt-4 flex items-start gap-2.5 rounded-xl bg-danger/10 px-3 py-2 text-xs text-danger ring-1 ring-danger/20"
            >
              <AlertTriangleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {error}
            </p>
          ) : null}
        </CardBody>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
        <aside className="edge-light flex min-h-[18rem] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-soft">
          <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
            <h2 className="text-[13.5px] font-semibold text-foreground">Agents ({agents.length})</h2>
          </div>
          <div aria-label="Agent list" className="flex-1 space-y-1 overflow-y-auto p-2">
            {loading ? (
              <div className="space-y-2 p-2">
                <Skeleton className="h-14 w-full rounded-xl" />
                <Skeleton className="h-14 w-3/4 rounded-xl" />
              </div>
            ) : agents.length === 0 ? (
              <p className="p-4 text-xs leading-5 text-muted-foreground">
                No agents yet. Create one above, give it an input, and the run is executed on the server.
              </p>
            ) : (
              agents.map((agent) => (
                <div key={agent.id} className="group flex items-center gap-1">
                  <button
                    onClick={() => {
                      setActiveId(agent.id);
                      setNotice(null);
                    }}
                    className={`min-w-0 flex-1 rounded-xl px-3 py-2.5 text-left transition-colors ${
                      activeId === agent.id
                        ? "bg-primary-soft"
                        : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                    }`}
                  >
                    <span className="block truncate text-[13px] font-medium">{agent.name}</span>
                    <span className="mt-1.5 block text-[11px] text-muted-foreground">
                      {agent._count?.runs ?? 0} run{agent._count?.runs === 1 ? "" : "s"} · max{" "}
                      {agent.maxSteps} steps
                    </span>
                  </button>
                  <button
                    aria-label={`Delete agent ${agent.name}`}
                    onClick={() => void removeAgent(agent)}
                    className="rounded-lg p-2 text-muted-foreground transition-all hover:bg-danger/10 hover:text-danger"
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </aside>

        {!active ? (
          <Card className="min-h-[18rem]">
            <CardBody className="flex min-h-[16rem] flex-col items-center justify-center gap-3 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-surface-2 text-muted-foreground">
                <BotIcon className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[15px] font-semibold text-foreground">No agent selected</p>
                <p className="mx-auto mt-2 max-w-sm text-[13px] leading-6 text-muted-foreground">
                  Pick an agent to start a run and read the plan, the steps it executed, and its output.
                </p>
              </div>
            </CardBody>
          </Card>
        ) : (
          <div className="space-y-5">
            <Card>
              <CardHeader
                title={active.name}
                subtitle={active.description ?? "No description."}
                icon={<BotIcon className="h-4 w-4" />}
                action={
                  <Button variant="outline" size="sm" onClick={() => void toggleMemory()}>
                    {active.memoryEnabled ? "Memory on" : "Memory off"}
                  </Button>
                }
              />
              <CardBody className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Badge tone="neutral">{active.providerModel ?? "router picks a model"}</Badge>
                  <Badge tone="neutral">max {active.maxSteps} steps</Badge>
                  {active.project ? <Badge tone="primary">{active.project.name}</Badge> : null}
                  <Badge tone={active.memoryEnabled ? "success" : "neutral"}>
                    memory {active.memoryEnabled ? "on" : "off"}
                  </Badge>
                  <Badge tone="neutral">{active._count?.runs ?? 0} runs</Badge>
                </div>
                {active.instructions ? (
                  <div>
                    <h3 className="font-mono text-[10.5px] tracking-[0.16em] text-muted-foreground uppercase">
                      Instructions
                    </h3>
                    <p className="mt-1.5 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">
                      {active.instructions}
                    </p>
                  </div>
                ) : null}
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Start a run"
                subtitle="The plan, every step and the output are produced on the server and stored against the run."
                icon={<PlayIcon className="h-4 w-4" />}
              />
              <CardBody>
                <form onSubmit={start} className="space-y-3">
                  <Field label="Input" htmlFor="agent-input" hint="Up to 8000 characters.">
                    <Textarea
                      id="agent-input"
                      value={input}
                      onChange={(event) => setInput(event.target.value)}
                      rows={3}
                      placeholder="Summarise the changes in these release notes."
                      maxLength={8000}
                    />
                  </Field>
                  <div className="flex justify-end">
                    <Button type="submit" disabled={!input.trim() || busy}>
                      {busy ? "Running…" : "Run agent"}
                      <PlayIcon className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </form>
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title={`Run history (${runs.length})`}
                subtitle="A run that is still open is polled; cancelling keeps whatever output it produced."
                icon={<ClockIcon className="h-4 w-4" />}
              />
              <CardBody className="space-y-4">
                {runs.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    This agent has not been run yet.
                  </p>
                ) : (
                  <>
                    <ul className="space-y-1.5">
                      {runs.map((run) => (
                        <li key={run.id} className="flex items-center gap-2">
                          <button
                            onClick={() => setRunId(run.id)}
                            className={`min-w-0 flex-1 rounded-xl px-3 py-2 text-left transition-colors ${
                              runId === run.id
                                ? "bg-primary-soft"
                                : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                            }`}
                          >
                            <span className="block truncate text-[12px]">{run.input}</span>
                            <span className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
                              <StatusChip
                                tone={toneByRunStatus[run.status]}
                                label={run.status.toLowerCase()}
                              />
                              <span>{when(run.createdAt)}</span>
                              {run.stepsExecuted > 0 ? <span>{run.stepsExecuted} steps</span> : null}
                            </span>
                          </button>
                          {ACTIVE.includes(run.status) ? (
                            <button
                              aria-label={`Cancel run ${run.id}`}
                              onClick={() => void cancel(run)}
                              className="rounded-lg p-2 text-muted-foreground transition-all hover:bg-danger/10 hover:text-danger"
                            >
                              <CloseIcon className="h-3.5 w-3.5" />
                            </button>
                          ) : null}
                        </li>
                      ))}
                    </ul>

                    {activeRun ? (
                      <div className="space-y-4 border-t border-border pt-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusChip
                            tone={toneByRunStatus[activeRun.status]}
                            label={activeRun.status.toLowerCase()}
                          />
                          {activeRun.provider ? (
                            <span className="font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase">
                              {activeRun.provider}
                              {activeRun.model ? `:${activeRun.model}` : ""}
                            </span>
                          ) : null}
                          {activeRun.cancelRequestedAt ? (
                            <Badge tone="warning">cancellation requested</Badge>
                          ) : null}
                        </div>

                        {activeRun.plan ? (
                          <div>
                            <h3 className="font-mono text-[10.5px] tracking-[0.16em] text-muted-foreground uppercase">
                              Plan
                            </h3>
                            <pre className="mt-1.5 max-h-40 overflow-auto whitespace-pre-wrap rounded-xl bg-surface-2 px-3 py-2 font-mono text-[11px] leading-5 text-muted-foreground ring-1 ring-border">
                              {JSON.stringify(activeRun.plan, null, 2)}
                            </pre>
                          </div>
                        ) : null}

                        {activeRun.steps?.length ? (
                          <div>
                            <h3 className="font-mono text-[10.5px] tracking-[0.16em] text-muted-foreground uppercase">
                              Steps ({activeRun.steps.length})
                            </h3>
                            <ul className="mt-2 space-y-1.5">
                              {activeRun.steps.map((step) => (
                                <li key={step.id} className="rounded-xl bg-surface-2 px-3 py-2 ring-1 ring-border">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-[11px] text-muted-foreground">
                                      #{step.position}
                                    </span>
                                    <span className="min-w-0 flex-1 truncate text-[12px] text-foreground">
                                      {step.title}
                                    </span>
                                    {step.tool ? <Badge tone="neutral">{step.tool}</Badge> : null}
                                    <Badge tone={toneByStepStatus[step.status]}>
                                      {step.status.toLowerCase()}
                                    </Badge>
                                    {step.durationMs !== null ? (
                                      <span className="text-[10.5px] text-muted-foreground">
                                        {step.durationMs}ms
                                      </span>
                                    ) : null}
                                  </div>
                                  {step.error ? (
                                    <p className="mt-1 text-[11px] text-danger">{step.error}</p>
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}

                        {ACTIVE.includes(activeRun.status) ? (
                          <p className="flex items-center gap-2 text-[11px] text-primary">
                            <RefreshIcon className="h-3.5 w-3.5" />
                            Running on the server — this view refreshes on its own.
                          </p>
                        ) : null}

                        {activeRun.error ? (
                          <p className="rounded-xl bg-danger/10 px-3 py-2 text-xs text-danger ring-1 ring-danger/20">
                            {activeRun.error}
                          </p>
                        ) : null}

                        {activeRun.output ? (
                          <div>
                            <h3 className="font-mono text-[10.5px] tracking-[0.16em] text-muted-foreground uppercase">
                              Output
                            </h3>
                            <p className="mt-1.5 whitespace-pre-wrap rounded-xl bg-surface-2 px-3 py-2.5 text-xs leading-6 text-foreground ring-1 ring-border">
                              {activeRun.output}
                            </p>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </>
                )}
              </CardBody>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
