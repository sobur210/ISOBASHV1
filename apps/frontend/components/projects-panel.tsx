"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import {
  AlertTriangleIcon,
  ChatIcon,
  CheckIcon,
  ClockIcon,
  FolderIcon,
  PlusIcon,
  BotIcon,
  TrashIcon,
} from "@/components/ui/icons";
import {
  Project,
  ProjectTask,
  TaskStatus,
  addProjectTask,
  createProject,
  deleteProject,
  deleteProjectTask,
  fetchProjectList,
  updateProject,
  updateProjectTask,
} from "@/lib/api";

const taskStatuses: TaskStatus[] = ["TODO", "IN_PROGRESS", "DONE", "FAILED", "CANCELLED"];

function when(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function ProjectsPanel() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskBody, setTaskBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await fetchProjectList();
      setProjects(list);
      return list;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Your projects could not be loaded.");
      return [];
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchProjectList(controller.signal)
      .then((list) => {
        setProjects(list);
        if (list[0]) setActiveId(list[0].id);
      })
      .catch((err) => {
        if ((err as Error).name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Your projects could not be loaded.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const active = projects.find((project) => project.id === activeId) ?? null;
  const tasks: ProjectTask[] = active?.tasks ?? [];

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const created = await createProject({
        name: name.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
      });
      setName("");
      setDescription("");
      setActiveId(created.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The project could not be created.");
    } finally {
      setBusy(false);
    }
  }

  async function rename(value: string) {
    if (!active || !value.trim() || value.trim() === active.name) return;
    setError(null);
    try {
      const updated = await updateProject(active.id, { name: value.trim() });
      setProjects((list) => list.map((item) => (item.id === updated.id ? updated : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "The project could not be renamed.");
    }
  }

  async function removeProject(project: Project) {
    setError(null);
    try {
      await deleteProject(project.id);
      const list = await load();
      if (activeId === project.id) setActiveId(list[0]?.id ?? null);
      setNotice(`Deleted “${project.name}” and its ${project.tasks.length} task(s).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The project could not be deleted.");
    }
  }

  async function addTask(event: FormEvent) {
    event.preventDefault();
    if (!active || !taskTitle.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const created = await addProjectTask(active.id, {
        title: taskTitle.trim(),
        ...(taskBody.trim() ? { description: taskBody.trim() } : {}),
      });
      setTaskTitle("");
      setTaskBody("");
      setProjects((list) =>
        list.map((item) => (item.id === active.id ? { ...item, tasks: [...item.tasks, created] } : item)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "The task could not be added.");
    } finally {
      setBusy(false);
    }
  }

  async function setTaskStatus(task: ProjectTask, status: TaskStatus) {
    if (task.status === status) return;
    setError(null);
    try {
      const updated = await updateProjectTask(task.id, { status });
      setProjects((list) =>
        list.map((item) =>
          item.id === active?.id
            ? { ...item, tasks: item.tasks.map((t) => (t.id === updated.id ? updated : t)) }
            : item,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "The task could not be updated.");
    }
  }

  async function removeTask(task: ProjectTask) {
    setError(null);
    try {
      await deleteProjectTask(task.id);
      setProjects((list) =>
        list.map((item) =>
          item.id === active?.id
            ? { ...item, tasks: item.tasks.filter((t) => t.id !== task.id) }
            : item,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "The task could not be deleted.");
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="New project"
          subtitle="A project scopes its tasks, agents, conversations, memories and files to one workspace."
          icon={<FolderIcon className="h-4 w-4" />}
        />
        <CardBody>
          <form onSubmit={create} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" htmlFor="project-name">
                <Input
                  id="project-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Website rewrite"
                  maxLength={120}
                />
              </Field>
              <Field label="Description" htmlFor="project-description" hint="Optional.">
                <Input
                  id="project-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Ship the new marketing site"
                  maxLength={1000}
                />
              </Field>
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={!name.trim() || busy}>
                {busy ? "Creating…" : "Create project"}
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
            <h2 className="text-[13.5px] font-semibold text-foreground">Projects ({projects.length})</h2>
          </div>
          <div aria-label="Project list" className="flex-1 space-y-1 overflow-y-auto p-2">
            {loading ? (
              <div className="space-y-2 p-2">
                <Skeleton className="h-14 w-full rounded-xl" />
                <Skeleton className="h-14 w-3/4 rounded-xl" />
              </div>
            ) : projects.length === 0 ? (
              <p className="p-4 text-xs leading-5 text-muted-foreground">
                No projects yet. Create one above to hold tasks, agents and files together.
              </p>
            ) : (
              projects.map((project) => (
                <div key={project.id} className="group flex items-center gap-1">
                  <button
                    onClick={() => {
                      setActiveId(project.id);
                      setNotice(null);
                    }}
                    className={`min-w-0 flex-1 rounded-xl px-3 py-2.5 text-left transition-colors ${
                      activeId === project.id
                        ? "bg-primary-soft"
                        : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                    }`}
                  >
                    <span className="block truncate text-[13px] font-medium">{project.name}</span>
                    <span className="mt-1.5 block text-[11px] text-muted-foreground">
                      {project.tasks.length} task{project.tasks.length === 1 ? "" : "s"} · updated{" "}
                      {when(project.updatedAt)}
                    </span>
                  </button>
                  <button
                    aria-label={`Delete project ${project.name}`}
                    onClick={() => void removeProject(project)}
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
                <FolderIcon className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[15px] font-semibold text-foreground">No project selected</p>
                <p className="mx-auto mt-2 max-w-sm text-[13px] leading-6 text-muted-foreground">
                  Create a project to give tasks, agents and uploaded files a shared scope.
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
                icon={<FolderIcon className="h-4 w-4" />}
                action={
                  <Input
                    aria-label="Rename project"
                    defaultValue={active.name}
                    onBlur={(event) => void rename(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                    }}
                    className="h-8 w-40 text-[13px]"
                    maxLength={120}
                  />
                }
              />
              <CardBody>
                <div className="flex flex-wrap gap-2">
                  <Badge tone="neutral">updated {when(active.updatedAt)}</Badge>
                  <Badge tone="neutral">
                    <ChatIcon className="h-3 w-3" />
                    {active._count?.conversations ?? 0} conversations
                  </Badge>
                  <Badge tone="neutral">
                    <BotIcon className="h-3 w-3" />
                    {active._count?.agents ?? 0} agents
                  </Badge>
                  <Badge tone="neutral">{active._count?.memories ?? 0} memories</Badge>
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title={`Task board (${tasks.length})`}
                subtitle="Status is enforced by the server; a task that is already in a state cannot be moved back into it."
                icon={<CheckIcon className="h-4 w-4" />}
              />
              <CardBody className="space-y-4">
                <form onSubmit={addTask} className="space-y-3">
                  <Field label="New task" htmlFor="task-title">
                    <Input
                      id="task-title"
                      value={taskTitle}
                      onChange={(event) => setTaskTitle(event.target.value)}
                      placeholder="Draft the landing page copy"
                      maxLength={200}
                    />
                  </Field>
                  <Field label="Details" htmlFor="task-description" hint="Optional.">
                    <Textarea
                      id="task-description"
                      value={taskBody}
                      onChange={(event) => setTaskBody(event.target.value)}
                      rows={2}
                      placeholder="Anything the agent should know before it runs."
                      maxLength={2000}
                    />
                  </Field>
                  <div className="flex justify-end">
                    <Button type="submit" disabled={!taskTitle.trim() || busy}>
                      {busy ? "Adding…" : "Add task"}
                      <PlusIcon className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </form>

                {tasks.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No tasks in this project yet. Add one above, then run an agent against it from the
                    Agents screen.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {tasks.map((task) => (
                      <li key={task.id} className="rounded-xl bg-surface-2 px-3 py-2.5 ring-1 ring-border">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
                            {task.title}
                          </span>
                          <Select
                            aria-label={`Status for ${task.title}`}
                            value={task.status}
                            onChange={(event) =>
                              void setTaskStatus(task, event.target.value as TaskStatus)
                            }
                            className="h-8 w-36 text-[12px]"
                          >
                            {taskStatuses.map((status) => (
                              <option key={status} value={status}>
                                {status.toLowerCase().replace("_", " ")}
                              </option>
                            ))}
                          </Select>
                          <button
                            aria-label={`Delete task ${task.title}`}
                            onClick={() => void removeTask(task)}
                            className="rounded-lg p-1.5 text-muted-foreground transition-all hover:bg-danger/10 hover:text-danger"
                          >
                            <TrashIcon className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        {task.description ? (
                          <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{task.description}</p>
                        ) : null}
                        {task.result ? (
                          <p className="mt-1.5 whitespace-pre-wrap rounded-lg bg-background px-2.5 py-2 text-[11px] leading-5 text-muted-foreground">
                            {task.result}
                          </p>
                        ) : null}
                        <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <ClockIcon className="h-3 w-3" />
                          {when(task.createdAt)}
                          {task.agentRunId ? " · produced by an agent run" : ""}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}

                {tasks.some((task) => task.status === "IN_PROGRESS") ? (
                  <p className="flex items-center gap-2 text-[11px] text-primary">
                    <ClockIcon className="h-3.5 w-3.5" />
                    A task is in progress. Open the Agents screen to watch the run that owns it.
                  </p>
                ) : null}
              </CardBody>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
