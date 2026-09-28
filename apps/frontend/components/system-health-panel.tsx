"use client";

import { useEffect, useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatusChip } from "@/components/ui/status-chip";
import { Button } from "@/components/ui/button";
import { SkeletonRows } from "@/components/ui/skeleton";
import {
  ActivityIcon,
  AlertTriangleIcon,
  BotIcon,
  ChartIcon,
  ClockIcon,
  CpuIcon,
  DatabaseIcon,
  GridIcon,
  RefreshIcon,
} from "@/components/ui/icons";
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

  return (
    <Card>
      <CardHeader
        title="System health"
        subtitle={`Live status for ${data?.components.length ?? 6} components, checked against the running stack. Nothing is hardcoded.`}
        icon={<ActivityIcon className="h-4 w-4" />}
        action={
          lastUpdated ? (
            <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
              <ClockIcon className="h-3.5 w-3.5" />
              {lastUpdated.toLocaleTimeString()}
            </span>
          ) : null
        }
      />
      <CardBody className="pt-1">
        {error ? (
          <div className="flex flex-col items-start gap-4 rounded-xl border border-danger/25 bg-danger/5 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
              <div>
                <p className="text-[13.5px] font-medium text-foreground">Health check failed</p>
                <p className="mt-1 text-xs text-muted-foreground">{error}</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={retry} disabled={retrying}>
              <RefreshIcon className="h-3.5 w-3.5" />
              {retrying ? "Retrying" : "Retry"}
            </Button>
          </div>
        ) : loading && !data ? (
          <SkeletonRows count={6} />
        ) : (
          <div className="divide-y divide-border">
            {data?.components.map((component) => {
              const meta = componentMeta[component.name] ?? {
                label: component.name,
                icon: <CpuIcon className="h-4 w-4" />,
              };
              return (
                <div key={component.name} className="flex items-center justify-between gap-4 py-3">
                  <div className="flex min-w-0 items-center gap-3.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-2 text-muted-foreground">
                      {meta.icon}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[13.5px] font-medium text-foreground">{meta.label}</p>
                      <p
                        className="mt-0.5 truncate text-xs text-muted-foreground"
                        title={component.detail}
                      >
                        {component.detail ??
                          (component.latencyMs != null
                            ? `Responded in ${component.latencyMs}ms.`
                            : "No detail reported.")}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {component.latencyMs != null ? (
                      <span className="hidden font-mono text-xs tabular-nums text-muted-foreground sm:inline">
                        {component.latencyMs}ms
                      </span>
                    ) : null}
                    <StatusChip
                      tone={component.status === "ok" ? "success" : "danger"}
                      label={component.status}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
