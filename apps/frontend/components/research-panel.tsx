"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/ui/status-chip";
import { BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import {
  AlertTriangleIcon,
  CheckIcon,
  ClockIcon,
  DatabaseIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
} from "@/components/ui/icons";
import {
  ResearchCapabilities,
  ResearchSession,
  ResearchSessionStatus,
  deleteResearchSession,
  fetchResearchCapabilities,
  fetchResearchSession,
  fetchResearchSessions,
  startResearch,
} from "@/lib/api";

const toneByStatus: Record<ResearchSessionStatus, BadgeTone> = {
  PENDING: "neutral",
  SEARCHING: "primary",
  RETRIEVING: "primary",
  ANSWERING: "primary",
  COMPLETED: "success",
  FAILED: "danger",
};

const TERMINAL: ResearchSessionStatus[] = ["COMPLETED", "FAILED"];

export function ResearchPanel() {
  const [sessions, setSessions] = useState<ResearchSession[]>([]);
  const [active, setActive] = useState<ResearchSession | null>(null);
  const [capabilities, setCapabilities] = useState<ResearchCapabilities | null>(null);
  const [question, setQuestion] = useState("");
  const [urls, setUrls] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    try {
      const list = await fetchResearchSessions();
      setSessions(list);
      return list;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load research sessions.");
      return [];
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchResearchSessions(controller.signal)
      .then((list) => {
        setSessions(list);
        if (list[0]) setActive(list[0]);
      })
      .catch((err) => {
        if ((err as Error).name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Could not load research sessions.");
      })
      .finally(() => setLoading(false));
    fetchResearchCapabilities(controller.signal)
      .then((value) => setCapabilities(value))
      .catch((err) => {
        if ((err as Error).name === "AbortError") return;
        setCapabilities(null);
      });
    return () => controller.abort();
  }, []);

  /** A run continues on the server; poll the open session until it is terminal. */
  const follow = useCallback(
    async (id: string) => {
      for (let attempt = 0; attempt < 90; attempt += 1) {
        const session = await fetchResearchSession(id).catch(() => null);
        if (!session) return;
        setActive(session);
        if (TERMINAL.includes(session.status)) {
          await loadList();
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      await loadList();
    },
    [loadList],
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!question.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const parsed = urls
        .split(/[\n,\s]+/)
        .map((value) => value.trim())
        .filter(Boolean);
      const started = await startResearch({ question: question.trim(), urls: parsed });
      setQuestion("");
      setUrls("");
      setActive(started);
      await loadList();
      if (!TERMINAL.includes(started.status)) await follow(started.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Research could not be started.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    try {
      await deleteResearchSession(id);
      const list = await loadList();
      if (active?.id === id) setActive(list[0] ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The session could not be deleted.");
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Retrieval-backed research"
          subtitle="The answer is built only from pages the server actually fetched, and every quote is checked against its source."
          icon={<SearchIcon className="h-4 w-4" />}
        />
        <CardBody>
          <form onSubmit={submit} className="space-y-4">
            <Field label="Research question" htmlFor="research-question">
              <Textarea
                id="research-question"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                rows={2}
                placeholder="What do the sources say about retrieval-backed research?"
              />
            </Field>

            <Field
              label="Sources to read"
              htmlFor="research-urls"
              hint="Optional. One URL per line, or comma separated."
            >
              <Input
                id="research-urls"
                value={urls}
                onChange={(event) => setUrls(event.target.value)}
                placeholder="https://example.com/report"
              />
            </Field>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {capabilities
                  ? capabilities.search.available
                    ? `Search via ${capabilities.search.provider} · up to ${capabilities.retrieval.maxSources} sources`
                    : "No search provider configured. Supply URLs to research"
                  : "Retrieval capability unknown"}
              </p>
              <Button type="submit" disabled={!question.trim() || busy}>
                {busy ? "Researching…" : "Run research"}
                <SearchIcon className="h-3.5 w-3.5" />
              </Button>
            </div>
          </form>

          {capabilities && !capabilities.search.available ? (
            <p className="mt-4 flex items-start gap-2.5 rounded-xl border border-warning/25 bg-warning/5 p-3.5 text-xs text-muted-foreground">
              <AlertTriangleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
              {capabilities.search.detail}
            </p>
          ) : null}
          {error ? (
            <p
              role="alert"
              className="mt-4 flex items-start gap-2.5 rounded-xl border border-danger/25 bg-danger/5 p-3.5 text-xs text-danger"
            >
              <AlertTriangleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {error}
            </p>
          ) : null}
        </CardBody>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
        <aside className="edge-light flex min-h-[20rem] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-soft">
          <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
            <h2 className="text-[13.5px] font-semibold text-foreground">Sessions</h2>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setActive(null);
                setQuestion("");
                setUrls("");
              }}
            >
              <PlusIcon className="h-3.5 w-3.5" />
              New
            </Button>
          </div>
          <div aria-label="Research session list" className="flex-1 space-y-1 overflow-y-auto p-2">
            {loading ? (
              <div className="space-y-2 p-2">
                <Skeleton className="h-14 w-full rounded-xl" />
                <Skeleton className="h-14 w-3/4 rounded-xl" />
              </div>
            ) : sessions.length === 0 ? (
              <p className="p-4 text-xs leading-5 text-muted-foreground">
                No research sessions yet. Ask a question above and the answer is built only from pages the
                server actually fetched.
              </p>
            ) : (
              sessions.map((session) => (
                <div key={session.id} className="group flex items-center gap-1">
                  <button
                    onClick={() => {
                      setActive(session);
                      fetchResearchSession(session.id).then(setActive).catch(() => undefined);
                    }}
                    className={`min-w-0 flex-1 rounded-xl px-3 py-2.5 text-left transition-colors ${
                      active?.id === session.id
                        ? "bg-primary-soft"
                        : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                    }`}
                  >
                    <span className="block truncate text-[13px] font-medium">{session.question}</span>
                    <span className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <StatusChip tone={toneByStatus[session.status]} label={session.status.toLowerCase()} />
                      {session._count?.sources ?? 0} src
                    </span>
                  </button>
                  <button
                    aria-label={`Delete research session: ${session.question}`}
                    onClick={() => remove(session.id)}
                    className="rounded-lg p-2 text-muted-foreground transition-all hover:bg-danger/10 hover:text-danger"
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </aside>

        <Card className="min-h-[26rem]">
          {!active ? (
            <CardBody className="flex min-h-[24rem] flex-col items-center justify-center gap-3 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-surface-2 text-muted-foreground">
                <SearchIcon className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[15px] font-semibold text-foreground">Nothing selected</p>
                <p className="mx-auto mt-2 max-w-sm text-[13px] leading-6 text-muted-foreground">
                  Run a research question to see the retrieved sources, the answer, and every citation
                  checked against the text it came from.
                </p>
              </div>
            </CardBody>
          ) : (
            <CardBody className="space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
                <h2 className="max-w-2xl text-[15px] font-semibold leading-6 text-foreground">
                  {active.question}
                </h2>
                <div className="flex shrink-0 items-center gap-2.5">
                  <StatusChip tone={toneByStatus[active.status]} label={active.status.toLowerCase()} />
                  {active.model ? (
                    <span className="font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase">
                      {active.provider}:{active.model}
                    </span>
                  ) : null}
                </div>
              </div>

              {active.retrieval !== "none" ? (
                <p className="font-mono text-[10.5px] tracking-[0.12em] text-muted-foreground uppercase">
                  retrieval: {active.retrieval}
                </p>
              ) : null}

              {active.error ? (
                <p className="flex items-start gap-2.5 rounded-xl border border-danger/25 bg-danger/5 p-3.5 text-xs text-danger">
                  <AlertTriangleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {active.error}
                </p>
              ) : null}

              {active.noEvidence ? (
                <p className="flex items-start gap-2.5 rounded-xl border border-warning/25 bg-warning/5 p-3.5 text-xs leading-5 text-muted-foreground">
                  <AlertTriangleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                  The model read every retrieved source and reported that they do not answer this question.
                  No citations were produced, and nothing was inferred from memory.
                </p>
              ) : null}

              {active.answer ? (
                <div className="edge-light whitespace-pre-wrap rounded-xl border border-border bg-background p-4 text-[13.5px] leading-7 text-foreground">
                  {active.answer}
                </div>
              ) : (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <ClockIcon className="h-3.5 w-3.5" />
                  {active.status === "FAILED" ? "No answer was produced." : "Retrieval in progress…"}
                </p>
              )}

              <div>
                <h3 className="flex items-center gap-2 font-mono text-[10.5px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
                  <DatabaseIcon className="h-3.5 w-3.5" />
                  Sources ({active.sources.length})
                </h3>
                <ul className="mt-3 space-y-2">
                  {active.sources.map((source) => (
                    <li key={source.id} className="rounded-xl border border-border bg-background p-3.5">
                      <p className="truncate text-[13px] font-medium text-foreground">
                        {source.title ?? source.url}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        {source.finalUrl ?? source.url}
                      </p>
                      <p className="mt-1.5 font-mono text-[10.5px] tracking-[0.06em] text-muted-foreground uppercase">
                        {source.status.toLowerCase()} · {source.origin} · {source.characters} chars
                        {source.httpStatus ? ` · HTTP ${source.httpStatus}` : ""}
                        {source.detail ? ` · ${source.detail}` : ""}
                      </p>
                    </li>
                  ))}
                  {active.sources.length === 0 ? (
                    <li className="text-xs text-muted-foreground">No source has been retrieved yet.</li>
                  ) : null}
                </ul>
              </div>

              <div>
                <h3 className="font-mono text-[10.5px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
                  Citations ({active.citations.length})
                </h3>
                <ul className="mt-3 space-y-2">
                  {active.citations.map((citation) => (
                    <li key={citation.id} className="rounded-xl border border-border bg-background p-3.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px] font-semibold text-primary">
                          {citation.marker}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1.5 text-[11px] ${
                            citation.verified ? "text-success" : "text-warning"
                          }`}
                        >
                          <CheckIcon className="h-3.5 w-3.5" />
                          {citation.verified ? "quote found in source" : "quote not found in source"}
                        </span>
                      </div>
                      <p className="mt-1.5 text-xs leading-5 text-muted-foreground italic">“{citation.quote}”</p>
                      {citation.source ? (
                        <p className="mt-1.5 truncate text-[11px] text-muted-foreground">
                          {citation.source.title ?? citation.source.url}
                        </p>
                      ) : null}
                    </li>
                  ))}
                  {active.citations.length === 0 ? (
                    <li className="text-xs text-muted-foreground">No citations were produced.</li>
                  ) : null}
                </ul>
              </div>
            </CardBody>
          )}
        </Card>
      </div>
    </div>
  );
}
