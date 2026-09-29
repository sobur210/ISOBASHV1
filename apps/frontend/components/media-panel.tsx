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
  CheckIcon,
  ClockIcon,
  ImageIcon,
  RefreshIcon,
  SparklesIcon,
  TrashIcon,
  VideoIcon,
} from "@/components/ui/icons";
import {
  ImageGeneration,
  MediaAsset,
  MediaCapabilities,
  MediaGenerationStatus,
  ProjectSummary,
  cancelImageGeneration,
  deleteImageGeneration,
  deleteMediaAsset,
  fetchImageGeneration,
  fetchImageGenerations,
  fetchMediaAssets,
  fetchMediaCapabilities,
  fetchProjects,
  mediaAssetDownloadUrl,
  mediaAssetUrl,
  startImageGeneration,
} from "@/lib/api";

const toneByStatus: Record<MediaGenerationStatus, BadgeTone> = {
  PENDING: "neutral",
  RUNNING: "primary",
  COMPLETED: "success",
  FAILED: "danger",
  CANCELLED: "warning",
};

const OPEN_STATUSES: MediaGenerationStatus[] = ["PENDING", "RUNNING"];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function formatWhen(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

export function MediaPanel() {
  const [capabilities, setCapabilities] = useState<MediaCapabilities | null>(null);
  const [generations, setGenerations] = useState<ImageGeneration[]>([]);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState("");
  const [count, setCount] = useState(1);
  const [model, setModel] = useState("");
  const [projectId, setProjectId] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadLibrary = useCallback(async () => {
    const [runs, media] = await Promise.all([
      fetchImageGenerations({ limit: 25 }),
      fetchMediaAssets({ limit: 60 }),
    ]);
    setGenerations(runs);
    setAssets(media);
  }, []);

  const loadCapabilities = useCallback(
    () =>
      fetchMediaCapabilities()
        .then((value) => setCapabilities(value))
        .catch(() => setCapabilities(null)),
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([fetchMediaCapabilities(controller.signal), fetchImageGenerations({ limit: 25 }, controller.signal), fetchMediaAssets({ limit: 60 }, controller.signal)])
      .then(([caps, runs, media]) => {
        setCapabilities(caps);
        setGenerations(runs);
        setAssets(media);
        if (caps.generation.aspectRatios.length > 0) setAspectRatio(caps.generation.aspectRatios[0]);
      })
      .catch((err) => {
        if ((err as Error).name === "AbortError") return;
        setError(err instanceof Error ? err.message : "The media library could not be loaded.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    fetchProjects(controller.signal)
      .then(setProjects)
      .catch(() => setProjects([]));
    return () => controller.abort();
  }, []);

  /**
   * Generation runs on the server, so a new run is followed by polling until it
   * is terminal. Nothing is reported as finished at the moment the request is
   * accepted.
   */
  const follow = useCallback(
    async (generationId: string) => {
      for (let attempt = 0; attempt < 120; attempt += 1) {
        const run = await fetchImageGeneration(generationId).catch(() => null);
        if (!run) return;
        setGenerations((list) => {
          const known = list.some((item) => item.id === run.id);
          return known ? list.map((item) => (item.id === run.id ? run : item)) : [run, ...list];
        });
        if (!OPEN_STATUSES.includes(run.status)) break;
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      await loadLibrary();
      await loadCapabilities();
    },
    [loadCapabilities, loadLibrary],
  );

  async function generate(event: FormEvent) {
    event.preventDefault();
    if (busy || !prompt.trim()) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const started = await startImageGeneration({
        prompt: prompt.trim(),
        ...(aspectRatio ? { aspectRatio } : {}),
        count,
        ...(model ? { model } : {}),
        ...(projectId ? { projectId: Number(projectId) } : {}),
      });
      setGenerations((list) => [started, ...list.filter((item) => item.id !== started.id)]);
      setNotice("Queued. The provider is being called now — the result appears when the bytes are stored.");
      await follow(started.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The image could not be generated.");
    } finally {
      setBusy(false);
    }
  }

  async function cancel(id: string) {
    setError(null);
    try {
      await cancelImageGeneration(id);
      await follow(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The run could not be cancelled.");
    }
  }

  async function removeGeneration(id: string) {
    setError(null);
    try {
      await deleteImageGeneration(id);
      await loadLibrary();
      await loadCapabilities();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The run could not be deleted.");
    }
  }

  async function removeAsset(id: string) {
    setError(null);
    try {
      await deleteMediaAsset(id);
      await loadLibrary();
      await loadCapabilities();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The asset could not be deleted.");
    }
  }

  const generation = capabilities?.generation;
  const available = generation?.available ?? false;
  const promptLimit = generation?.maxPromptCharacters ?? 1000;
  const maxImages = generation?.maxImagesPerRequest ?? 1;
  const modelOptions = generation?.models ?? [];

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Generate an image"
          subtitle="The prompt goes to a provider that really renders it. A run is only reported complete once the bytes are stored, and a refusal or a quota error is shown as the failure it is."
          icon={<SparklesIcon className="h-4 w-4" />}
        />
        <CardBody className="space-y-4">
          {!capabilities ? (
            <Skeleton className="h-32 w-full" />
          ) : !available ? (
            <p className="rounded-xl bg-warning/10 px-3 py-2.5 text-xs text-warning ring-1 ring-warning/20">
              {generation?.detail}
            </p>
          ) : null}

          <form onSubmit={generate} className="space-y-4">
            <Field
              label="Prompt"
              htmlFor="media-prompt"
              hint={`${prompt.length} of ${promptLimit} characters.`}
            >
              <Textarea
                id="media-prompt"
                rows={3}
                value={prompt}
                maxLength={promptLimit}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="A studio photograph of a brass orrery on a dark desk, warm key light, shallow depth of field"
                disabled={!available}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Aspect ratio" htmlFor="media-aspect">
                <Select
                  id="media-aspect"
                  value={aspectRatio}
                  onChange={(event) => setAspectRatio(event.target.value)}
                  disabled={!available}
                >
                  {(generation?.aspectRatios ?? []).map((ratio) => (
                    <option key={ratio} value={ratio}>
                      {ratio}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Images" htmlFor="media-count" hint={`At most ${maxImages} per request.`}>
                <Input
                  id="media-count"
                  type="number"
                  min={1}
                  max={maxImages}
                  value={count}
                  onChange={(event) => setCount(Math.min(Math.max(Number(event.target.value) || 1, 1), maxImages))}
                  disabled={!available}
                />
              </Field>

              <Field
                label="Model"
                htmlFor="media-model"
                hint="Empty lets the router choose an enabled image model."
              >
                <Select
                  id="media-model"
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                  disabled={!available}
                >
                  <option value="">Automatic</option>
                  {modelOptions.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.provider}: {entry.id}
                      {entry.autoSelectable ? "" : " (alias)"}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Project" htmlFor="media-project" hint="Optional. Assets are scoped to it.">
                <Select
                  id="media-project"
                  value={projectId}
                  onChange={(event) => setProjectId(event.target.value)}
                  disabled={!available}
                >
                  <option value="">No project</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={busy || !available || !prompt.trim()}>
                {busy ? "Generating…" : "Generate"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setNotice(null);
                  setError(null);
                  void loadLibrary().then(loadCapabilities);
                }}
              >
                <RefreshIcon className="h-4 w-4" /> Refresh
              </Button>
            </div>
          </form>

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
            subtitle="Provider health is reported per provider, and the limits below are the ones the server enforces."
            icon={<ImageIcon className="h-4 w-4" />}
          />
          <CardBody className="space-y-3 text-xs text-muted-foreground">
            {!capabilities ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusChip
                    tone={generation?.available ? "success" : "warning"}
                    label={generation?.available ? "Image generation wired" : "No image provider"}
                  />
                  {generation?.providers.map((provider) => (
                    <Badge
                      key={provider.provider}
                      tone={
                        provider.status === "healthy"
                          ? "success"
                          : provider.status === "unavailable"
                            ? "danger"
                            : "neutral"
                      }
                    >
                      {provider.provider} · {provider.status}
                    </Badge>
                  ))}
                </div>

                <p>{generation?.detail}</p>

                <Row label="Prompt ceiling" value={`${generation?.maxPromptCharacters} characters`} />
                <Row
                  label="Per request"
                  value={`${generation?.maxImagesPerRequest} image(s), at most ${formatBytes(generation?.maxImageBytes ?? 0)} each`}
                />
                <Row
                  label="Per account"
                  value={`${generation?.maxAssetsPerUser} asset(s) · ${formatBytes(generation?.maxTotalBytesPerUser ?? 0)} total · ${generation?.generationsPerHour} generation(s) per hour`}
                />
                <Row
                  label="Your usage"
                  value={`${capabilities.usage.generations} generation(s) · ${capabilities.usage.assets} asset(s) · ${formatBytes(capabilities.usage.storedBytes)}`}
                />

                <div className="rounded-xl bg-surface-2 px-3 py-2.5 ring-1 ring-border">
                  <div className="mb-1 flex items-center gap-2">
                    <Badge tone="neutral">moderation</Badge>
                    <span>{capabilities.moderation.enforced}</span>
                  </div>
                  <p>{capabilities.moderation.detail}</p>
                </div>

                <div className="rounded-xl bg-surface-2 px-3 py-2.5 ring-1 ring-border">
                  <div className="mb-1 flex items-center gap-2">
                    <Badge tone={capabilities.video.available ? "success" : "warning"}>video</Badge>
                    <StatusChip
                      tone={capabilities.video.available ? "success" : "warning"}
                      label={capabilities.video.available ? "available" : "not wired"}
                    />
                  </div>
                  <p>{capabilities.video.detail}</p>
                </div>

                {capabilities.lastFailure ? (
                  <div className="rounded-xl bg-danger/8 px-3 py-2.5 ring-1 ring-danger/20">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <Badge tone="danger">{capabilities.lastFailure.errorCode ?? "FAILED"}</Badge>
                      <span>{formatWhen(capabilities.lastFailure.createdAt)}</span>
                    </div>
                    <p className="text-danger">{capabilities.lastFailure.error}</p>
                    {capabilities.lastFailure.finishReason ? (
                      <p className="mt-1">Provider finish reason: {capabilities.lastFailure.finishReason}</p>
                    ) : null}
                  </div>
                ) : null}
              </>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Generation runs"
            subtitle="State is written as it happens, so an open run here is a run that is still going."
            icon={<ClockIcon className="h-4 w-4" />}
          />
          <CardBody>
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : generations.length === 0 ? (
              <p className="text-xs text-muted-foreground">No generations yet.</p>
            ) : (
              <ul className="space-y-2">
                {generations.map((generation) => (
                  <li key={generation.id} className="rounded-xl bg-surface-2 px-3 py-2.5 ring-1 ring-border">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusChip tone={toneByStatus[generation.status]} label={generation.status.toLowerCase()} />
                      {generation.aspectRatio ? <Badge tone="neutral">{generation.aspectRatio}</Badge> : null}
                      {generation.provider ? <Badge tone="accent">{generation.provider}</Badge> : null}
                      {generation.model ? <span className="truncate text-[11px] text-muted-foreground">{generation.model}</span> : null}
                    </div>
                    <p className="mt-1 text-xs leading-5 text-foreground">{generation.prompt}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {generation.assets.length} of {generation.requestedCount} stored · {formatWhen(generation.createdAt)}
                    </p>
                    {generation.error ? (
                      <p className="mt-1 text-[11px] text-danger">
                        {generation.errorCode ? `${generation.errorCode}: ` : ""}
                        {generation.error}
                      </p>
                    ) : null}
                    {generation.warning ? <p className="mt-1 text-[11px] text-warning">{generation.warning}</p> : null}
                    <div className="mt-2 flex flex-wrap gap-3">
                      {OPEN_STATUSES.includes(generation.status) ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                          onClick={() => void cancel(generation.id)}
                        >
                          Cancel
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-danger"
                        onClick={() => void removeGeneration(generation.id)}
                      >
                        <TrashIcon className="h-3 w-3" /> Delete run and files
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Media library"
          subtitle="Stored bytes only. Every row here has a file on disk, a checksum that is verified on read, and dimensions sniffed from those bytes."
          icon={<ImageIcon className="h-4 w-4" />}
        />
        <CardBody>
          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Skeleton className="h-48 w-full" />
              <Skeleton className="h-48 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
          ) : assets.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nothing stored yet. A generation that is refused or that produces no bytes writes no asset — the run records why instead.
            </p>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {assets.map((asset) => (
                <li key={asset.id} className="overflow-hidden rounded-xl bg-surface-2 ring-1 ring-border">
                  <div className="relative aspect-square bg-surface-3">
                    {/* The bytes come from an authenticated API route, so the
                        Next.js optimizer cannot fetch them without a cookie. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={mediaAssetUrl(asset.id)}
                      alt={asset.prompt ?? "Generated image"}
                      className="h-full w-full object-contain"
                      loading="lazy"
                    />
                  </div>
                  <div className="space-y-2 px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="neutral">{asset.kind}</Badge>
                      <Badge tone="neutral">{asset.mimeType}</Badge>
                      {asset.width && asset.height ? (
                        <span className="text-[11px] text-muted-foreground">
                          {asset.width}×{asset.height}
                        </span>
                      ) : null}
                    </div>
                    <p className="line-clamp-2 text-[11px] text-muted-foreground">{asset.prompt ?? "No prompt recorded."}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {formatBytes(asset.sizeBytes)} · {formatWhen(asset.createdAt)}
                      {asset.provider ? ` · ${asset.provider}` : ""}
                    </p>
                    {asset.note ? <p className="text-[11px] text-muted-foreground">{asset.note}</p> : null}
                    <div className="flex flex-wrap gap-3">
                      <a
                        href={mediaAssetDownloadUrl(asset.id)}
                        className="text-[11px] text-primary hover:underline"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Download
                      </a>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-danger"
                        onClick={() => void removeAsset(asset.id)}
                      >
                        <TrashIcon className="h-3 w-3" /> Delete
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Video"
          subtitle="Reserved surface. Nothing on this page renders a video."
          icon={<VideoIcon className="h-4 w-4" />}
        />
        <CardBody>
          <p className="text-xs text-muted-foreground">
            {capabilities?.video.detail ??
              "Text-to-video, image-to-video and animation are not wired to a provider yet."}
          </p>
        </CardBody>
      </Card>
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
