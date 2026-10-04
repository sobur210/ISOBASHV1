"use client";

import { useEffect, useState } from "react";
import { StatusChip } from "@/components/ui/status-chip";
import { Notice, Panel, PanelBody, PanelFooter, PanelHeader } from "@/components/admin/ui";
import { formatClock } from "@/components/admin/format";
import {
  ActivityIcon,
  BotIcon,
  ChartIcon,
  ClockIcon,
  CpuIcon,
  DatabaseIcon,
  GridIcon,
  RefreshIcon,
} from "@/components/ui/icons";
import { SkeletonRows } from "@/components/ui/skeleton";
import { getJsonAuthed } from "@/lib/api";

type SystemComponent = {
  name: string;
  status: "ok" | "error";
  detail?: string;
  latencyMs?: number;
};

type SystemHealthResult = {
  status: "ok" | "degraded";
  service: string;
  timestamp: string;
  components: SystemComponent[];
};

const REFRESH_MS = 10_000;

const componentMeta: Record<string, { label: string; icon: React.ReactNode }> = {
  frontend: { label: "Frontend", icon: <GridIcon className="h-4 w-4" /> },
  backend: { label: "Backend", icon: <CpuIcon className="h-4 w-4" /> },
  database: { label: "Database", icon: <DatabaseIcon className="h-4 w-4" /> },
  redis: { label: "Redis", icon: <ActivityIcon className="h-4 w-4" /> },
  "job-queue": { label: "Job queue", icon: <ChartIcon className="h-4 w-4" /> },
  ollama: { label: "Local AI (Ollama)", icon: <BotIcon className="h-4 w-4" /> },
};

/**
 * Live per-component health, refreshed on a timer.
 *
 * Latency is shown as its own right-aligned monospace column rather than folded
 * into the detail sentence: it is a number to compare between rows, so it has to
 * be scannable in the same position on every row.
 */
export function SystemHealthPanel() {
  const [data, setData] = useState<SystemHealthResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const refresh = (signal?: AbortSignal) =>
    getJsonAuthed<SystemHealthResult>("/admin/system-health", signal)
      .then((result) => {
        setData(result);
        setError(null);
        setLastUpdated(new Date());
      })
      .catch((err: unknown) => {
        if ((err as Error).name === "AbortError") return;
        setError(err instanceof Error ? err.message : "The API is unreachable.");
      })
      .finally(() => {
        setLoading(false);
      });

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    const timer = setInterval(() => void refresh(controller.signal), REFRESH_MS);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, []);

  const retry = () => {
    setRetrying(true);
    void refresh().finally(() => setRetrying(false));
  };

  const failing = data?.components.filter((component) => component.status !== "ok").length ?? 0;

  return (
    <Panel>
      <PanelHeader
        title="Component health"
        description="Every dependency probed live by the API. Nothing here is hardcoded."
        icon={<ActivityIcon className="h-4 w-4" />}
        meta={
          <>
            {data ? (
              <StatusChip
                tone={data.status === "ok" ? "success" : "danger"}
                label={data.status === "ok" ? "all ok" : `${failing} failing`}
              />
            ) : null}
            {lastUpdated ? (
              <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                <ClockIcon className="h-3.5 w-3.5" />
                {formatClock(lastUpdated)}
              </span>
            ) : null}
            <button
              type="button"
              onClick={retry}
              disabled={retrying}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[11.5px] font-medium text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground disabled:opacity-45"
            >
              <RefreshIcon className={`h-3.5 w-3.5 ${retrying ? "animate-spin" : ""}`} />
              {retrying ? "Checking" : "Check now"}
            </button>
          </>
        }
      />
      <PanelBody className="px-0 py-0">
        {error ? (
          <div className="px-5 py-4">
            <Notice tone="danger">{error}</Notice>
          </div>
        ) : loading && !data ? (
          <div className="px-5 py-4">
            <SkeletonRows count={6} />
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {data?.components.map((component) => {
              const meta = componentMeta[component.name] ?? {
                label: component.name,
                icon: <CpuIcon className="h-4 w-4" />,
              };
              return (
                <li
                  key={component.name}
                  className="flex items-center justify-between gap-4 px-5 py-2.5 transition-colors hover:bg-surface-2/50"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="shrink-0 text-muted-foreground">{meta.icon}</span>
                    <div className="min-w-0">
                      <p className="text-[12.5px] font-medium text-foreground">{meta.label}</p>
                      <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground" title={component.detail}>
                        {component.detail ??
                          (component.latencyMs != null
                            ? `Responded in ${component.latencyMs}ms.`
                            : "No detail reported.")}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-4">
                    <span className="hidden w-16 text-right font-mono text-[11.5px] tabular-nums text-muted-foreground sm:inline">
                      {component.latencyMs != null ? `${component.latencyMs}ms` : "—"}
                    </span>
                    <StatusChip
                      tone={component.status === "ok" ? "success" : "danger"}
                      label={component.status}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </PanelBody>
      <PanelFooter>
        <span className="font-mono text-[11px] text-muted-foreground">
          auto-refresh every {REFRESH_MS / 1000}s
        </span>
      </PanelFooter>
    </Panel>
  );
}