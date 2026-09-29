"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/ui/status-chip";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import {
  AlertTriangleIcon,
  CheckIcon,
  ClockIcon,
  DatabaseIcon,
  FileIcon,
  RefreshIcon,
  SearchIcon,
  TrashIcon,
} from "@/components/ui/icons";
import {
  FileCapabilities,
  FileKind,
  FileRecord,
  FileStatus,
  FileText,
  KnowledgeSearch,
  KnowledgeStats,
  ProjectSummary,
  deleteFile,
  downloadFileUrl,
  fetchFile,
  fetchFileCapabilities,
  fetchFileText,
  fetchFiles,
  fetchKnowledgeStats,
  fetchProjects,
  reindexFile,
  searchKnowledge,
  uploadFile,
} from "@/lib/api";

const toneByStatus: Record<FileStatus, BadgeTone> = {
  PENDING: "neutral",
  PROCESSING: "primary",
  READY: "success",
  FAILED: "danger",
};

const PENDING_STATUSES: FileStatus[] = ["PENDING", "PROCESSING"];

const KINDS: FileKind[] = ["text", "markdown", "csv", "json", "html", "pdf", "image", "archive", "binary"];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

export function FilesPanel() {
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [active, setActive] = useState<FileRecord | null>(null);
  /** Tagged with the file it came from so a stale preview can never be shown. */
  const [activeText, setActiveText] = useState<{ id: string; value: FileText } | null>(null);
  const [capabilities, setCapabilities] = useState<FileCapabilities | null>(null);
  const [stats, setStats] = useState<KnowledgeStats | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [kind, setKind] = useState<FileKind | "">("");
  const [projectId, setProjectId] = useState<string>("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<KnowledgeSearch | null>(null);
  const [searching, setSearching] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const loadFiles = useCallback(async () => {
    const list = await fetchFiles({
      ...(kind ? { kind } : {}),
      ...(projectId ? { projectId: Number(projectId) } : {}),
    });
    setFiles(list);
    return list;
  }, [kind, projectId]);

  const loadStats = useCallback(
    () =>
      fetchKnowledgeStats()
        .then((value) => setStats(value))
        .catch(() => setStats(null)),
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchFileCapabilities(controller.signal)
      .then((value) => setCapabilities(value))
      .catch((err) => {
        if ((err as Error).name === "AbortError") return;
        setCapabilities(null);
      });
    fetchProjects(controller.signal)
      .then((value) => setProjects(value))
      .catch((err) => {
        if ((err as Error).name === "AbortError") return;
        setProjects([]);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchFiles(
      { ...(kind ? { kind } : {}), ...(projectId ? { projectId: Number(projectId) } : {}) },
      controller.signal,
    )
      .then(async (list) => {
        setFiles(list);
        setActive(list[0] ?? null);
        setStats(await fetchKnowledgeStats(controller.signal).catch(() => null));
      })
      .catch((err) => {
        if ((err as Error).name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Could not load files.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [kind, projectId]);

  const activeId = active?.id ?? null;
  useEffect(() => {
    if (!activeId) return;
    const controller = new AbortController();
    fetchFileText(activeId, 4000, controller.signal)
      .then((value) => setActiveText({ id: activeId, value }))
      .catch((err) => {
        if ((err as Error).name === "AbortError") return;
        setActiveText(null);
      });
    return () => controller.abort();
  }, [activeId]);
  const preview = activeText && activeText.id === activeId ? activeText.value : null;

  /**
   * Indexing happens on the server, so an upload is followed by a short poll
   * rather than being reported as finished the moment the bytes are accepted.
   */
  const settle = useCallback(
    async (id: string) => {
      for (let attempt = 0; attempt < 60; attempt += 1) {
        const record = await fetchFile(id).catch(() => null);
        if (!record) return;
        setActive(record);
        if (!PENDING_STATUSES.includes(record.status)) break;
        await new Promise((resolve) => setTimeout(resolve, 700));
      }
      await loadFiles();
      await loadStats();
    },
    [loadFiles, loadStats],
  );

  async function onUpload(file: File) {
    if (uploading) return;
    setUploading(true);
    setError(null);
    setNotice(null);
    try {
      const stored = await uploadFile(file, projectId ? Number(projectId) : undefined);
      setNotice(`Stored ${stored.originalName} as ${stored.kind}. Indexing is running on the server.`);
      setActive(stored);
      await settle(stored.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The upload was refused.");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function search(event: FormEvent) {
    event.preventDefault();
    if (!query.trim() || searching) return;
    setSearching(true);
    setError(null);
    try {
      setResults(
        await searchKnowledge({
          q: query.trim(),
          ...(projectId ? { projectId: Number(projectId) } : {}),
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "The search could not be completed.");
    } finally {
      setSearching(false);
    }
  }

  async function reindex(id: string) {
    setError(null);
    try {
      await reindexFile(id, projectId ? Number(projectId) : null);
      await settle(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The file could not be re-indexed.");
    }
  }

  async function remove(record: FileRecord) {
    setError(null);
    try {
      await deleteFile(record.id);
      const list = await loadFiles();
      if (active?.id === record.id) setActive(list[0] ?? null);
      await loadStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The file could not be deleted.");
    }
  }

  const embedding = capabilities?.embeddings;
  const maxBytes = capabilities?.upload.maxBytes ?? 0;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Upload a document"
          subtitle="Bytes are checked for size, extension, signature and UTF-8 validity before anything is written, and the stored path is generated by the server."
          icon={<FileIcon className="h-4 w-4" />}
        />
        <CardBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Scope to a project" htmlFor="file-project" hint="Optional. Scopes the list and the knowledge search.">
              <Select id="file-project" value={projectId} onChange={(event) => { setLoading(true); setProjectId(event.target.value); }}>
                <option value="">All files</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Filter by type" htmlFor="file-kind">
              <Select id="file-kind" value={kind} onChange={(event) => { setLoading(true); setKind(event.target.value as FileKind | ""); }}>
                <option value="">Every type</option>
                {KINDS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="rounded-xl border border-dashed border-border-strong bg-surface-2 px-4 py-6 text-center">
            <input
              ref={fileInput}
              type="file"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void onUpload(file);
              }}
            />
            <p className="text-sm text-foreground">
              {maxBytes > 0 ? `Up to ${formatBytes(maxBytes)} per file.` : "Choose a document to index."}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {capabilities
                ? capabilities.upload.types.map((entry) => `.${entry.extension.split(", ")[0]}`).join(" ")
                : "Loading the accepted types…"}
            </p>
            <Button
              className="mt-4"
              type="button"
              disabled={uploading}
              onClick={() => fileInput.current?.click()}
            >
              {uploading ? "Uploading…" : "Choose a file"}
            </Button>
          </div>

          {notice ? (
            <p className="flex items-start gap-2 rounded-xl bg-success/10 px-3 py-2 text-xs text-success ring-1 ring-success/20">
              <CheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {notice}
            </p>
          ) : null}
          {error ? (
            <p className="flex items-start gap-2 rounded-xl bg-danger/10 px-3 py-2 text-xs text-danger ring-1 ring-danger/20">
              <AlertTriangleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {error}
            </p>
          ) : null}
        </CardBody>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="What this build can actually do"
            subtitle="Every claim below is enforced by the server, and the ones that are not implemented are reported as such."
            icon={<DatabaseIcon className="h-4 w-4" />}
          />
          <CardBody className="space-y-3 text-xs text-muted-foreground">
            {!capabilities ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <>
                <Row
                  label="Per file / per account"
                  value={`${formatBytes(capabilities.upload.maxBytes)} · ${capabilities.upload.maxFilesPerUser} files · ${formatBytes(
                    capabilities.upload.maxTotalBytesPerUser,
                  )} total`}
                />
                <Row
                  label="Read for real"
                  value={["text", "markdown", "csv", "json", "html", "pdf"].join(", ")}
                />
                <Row
                  label="Stored but not indexed"
                  value="images, and ZIP-based office documents — OCR is not available"
                />
                <Row
                  label="Chunking"
                  value={`${capabilities.extraction.chunkSize} characters with ${capabilities.extraction.chunkOverlap} overlapping, at most ${capabilities.extraction.maxChunksPerFile} chunks`}
                />
                <div className="rounded-xl bg-surface-2 px-3 py-2.5 ring-1 ring-border">
                  <div className="mb-1 flex items-center gap-2">
                    <StatusChip
                      tone={embedding?.available ? "success" : "warning"}
                      label={embedding?.available ? "Embeddings available" : "Embeddings unavailable"}
                    />
                    {embedding?.available ? <Badge tone="neutral">{embedding.model}</Badge> : null}
                  </div>
                  <p>{embedding?.detail}</p>
                </div>
                {stats ? (
                  <Row
                    label="Your index"
                    value={`${stats.files} file(s) · ${stats.chunks} chunk(s) · ${stats.embeddedChunks} embedded · ${formatBytes(
                      stats.storedBytes,
                    )}`}
                  />
                ) : null}
              </>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Search the knowledge index"
            subtitle="Keyword matching always works. Vector similarity runs only when an embedding model answered, and the result says which."
            icon={<SearchIcon className="h-4 w-4" />}
          />
          <CardBody className="space-y-4">
            <form onSubmit={search} className="flex gap-2">
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="What do your documents say about chunking?"
                aria-label="Knowledge search query"
              />
              <Button type="submit" disabled={searching || !query.trim()}>
                {searching ? "Searching…" : "Search"}
              </Button>
            </form>

            {results ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge tone={results.mode === "keyword" ? "neutral" : "accent"}>{results.mode}</Badge>
                  <span>
                    {results.hits.length} hit(s) from {results.candidatesConsidered} candidate(s) in {results.tookMs} ms
                  </span>
                </div>
                <p className="rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted-foreground ring-1 ring-border">
                  {results.detail}
                </p>
                {results.hits.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Nothing scored high enough to be shown. This is reported rather than filled with the least irrelevant chunk.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {results.hits.map((hit) => (
                      <li key={hit.chunkId} className="rounded-xl bg-surface-2 px-3 py-2.5 ring-1 ring-border">
                        <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                          <Badge tone={hit.matchedBy === "keyword" ? "neutral" : "accent"}>{hit.matchedBy}</Badge>
                          <span className="truncate font-medium text-foreground">{hit.fileName}</span>
                          <span>chunk {hit.ordinal}</span>
                          <span>score {hit.score.toFixed(3)}</span>
                        </div>
                        <p className="whitespace-pre-wrap text-xs leading-5 text-muted-foreground">{hit.snippet}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Search your own stored documents. A query that matches nothing is reported as no match, not padded with unrelated text.
              </p>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Stored files"
            subtitle="Indexing state, what was read, and what was skipped."
            icon={<FileIcon className="h-4 w-4" />}
          />
          <CardBody>
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : files.length === 0 ? (
              <p className="text-xs text-muted-foreground">No files yet. Upload a document to build the index.</p>
            ) : (
              <ul className="space-y-2">
                {files.map((file) => (
                  <li
                    key={file.id}
                    className={`rounded-xl px-3 py-2.5 ring-1 transition-colors ${
                      active?.id === file.id ? "bg-primary/8 ring-primary/30" : "bg-surface-2 ring-border"
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className="truncate text-left text-sm font-medium text-foreground hover:underline"
                        onClick={() => setActive(file)}
                      >
                        {file.originalName}
                      </button>
                      <StatusChip tone={toneByStatus[file.status]} label={file.status.toLowerCase()} />
                      <Badge tone="neutral">{file.kind}</Badge>
                      {file.embeddedAt ? <Badge tone="accent">embedded</Badge> : null}
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {formatBytes(file.sizeBytes)} · {file.characters} characters · {file.chunkCount} chunk(s)
                      {file.truncated ? " · truncated" : ""}
                    </p>
                    {file.error ? <p className="mt-1 text-[11px] text-danger">{file.error}</p> : null}
                    {file.warning ? <p className="mt-1 text-[11px] text-warning">{file.warning}</p> : null}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <a
                        href={downloadFileUrl(file.id)}
                        className="text-[11px] text-primary hover:underline"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Download
                      </a>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                        onClick={() => void reindex(file.id)}
                      >
                        <RefreshIcon className="h-3 w-3" /> Re-index
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-danger"
                        onClick={() => void remove(file)}
                      >
                        <TrashIcon className="h-3 w-3" /> Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title={active ? active.originalName : "Extracted text"}
            subtitle={
              active
                ? "The text a model is allowed to read, and the chunks it was split into."
                : "Select a file to see what was extracted."
            }
            icon={<DatabaseIcon className="h-4 w-4" />}
          />
          <CardBody className="space-y-3">
            {!active ? (
              <p className="text-xs text-muted-foreground">Nothing selected.</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                  <Badge tone="neutral">{active.mimeType}</Badge>
                  <Badge tone="neutral">{active.extension || "no extension"}</Badge>
                  {active.extractable ? (
                    <Badge tone="success">read for real</Badge>
                  ) : (
                    <Badge tone="warning">stored, not indexed</Badge>
                  )}
                  {active.embeddingModel ? <Badge tone="accent">{active.embeddingModel}</Badge> : null}
                </div>

                {active.chunks?.length ? (
                  <div className="rounded-xl bg-surface-2 px-3 py-2 text-[11px] text-muted-foreground ring-1 ring-border">
                    {active.chunks.length} chunk(s), {active.chunks.filter((c) => c.embeddedAt).length} embedded
                    {active.chunks[0] ? ` · first chunk ~${active.chunks[0].tokenEstimate} tokens` : ""}
                  </div>
                ) : null}

                {active.status === "FAILED" ? (
                  <p className="rounded-xl bg-danger/10 px-3 py-2 text-xs text-danger ring-1 ring-danger/20">
                    {active.error ?? "Processing failed."}
                  </p>
                ) : PENDING_STATUSES.includes(active.status) ? (
                  <p className="flex items-center gap-2 rounded-xl bg-primary/10 px-3 py-2 text-xs text-primary ring-1 ring-primary/20">
                    <ClockIcon className="h-3.5 w-3.5" /> Indexing on the server…
                  </p>
                ) : preview && preview.text ? (
                  <>
                    {preview.truncated ? (
                      <p className="text-[11px] text-warning">
                        Showing the first {preview.text.length} of {preview.characters} characters.
                      </p>
                    ) : null}
                    <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-xl bg-surface-2 px-3 py-2.5 text-xs leading-5 text-muted-foreground ring-1 ring-border">
                      {preview.text}
                    </pre>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {active.warning ?? "No text could be extracted from this file."}
                  </p>
                )}
              </>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap gap-x-2">
      <span className="font-medium text-foreground">{label}:</span>
      <span>{value}</span>
    </div>
  );
}
