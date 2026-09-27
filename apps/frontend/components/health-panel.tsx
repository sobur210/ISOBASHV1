"use client";

import { useEffect, useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatusChip } from "@/components/ui/status-chip";
import { SkeletonTextRow } from "@/components/ui/skeleton";
import {
  ActivityIcon,
  AlertTriangleIcon,
  BotIcon,
  ClockIcon,
  CpuIcon,
  DatabaseIcon,
} from "@/components/ui/icons";
import { getJson } from "@/lib/api";

type ComponentStatus = { name: string; status: "ok" | "error"; detail?: string };
type HealthResult = {
  status: "ok" | "degraded";
  service: string;
  timestamp: string;
  components: ComponentStatus[];
};
type ProviderHealth = {
  provider: string;
  status: string;
  capabilities: string[];
  detail?: string;
};

const REFRESH_MS = 30_000;

export function HealthPanel() {
  const [data, setData] = useState<HealthResult | null>(null);
  const [providers, setProviders] = useState<ProviderHealth[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const refresh = (signal?: AbortSignal) =>
    Promise.all([
      getJson<HealthResult>("/health", signal),
      getJson<ProviderHealth[]>("/ai/providers/health", signal),
    ])
      .then(([health, providerHealth]) => {
        setData(health);
        setProviders(providerHealth);
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
        title="System status"
        subtitle="Live information directly from the API. Nothing here is simulated."
        icon={<ActivityIcon className="h-4 w-4" />}
        action={
          lastUpdated ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <ClockIcon className="h-3.5 w-3.5" />
              {lastUpdated.toLocaleTimeString()}
            </span>
          ) : null
        }
      />
      <CardBody>
        {error ? (
          <div className="flex flex-col items-start gap-3 rounded-xl border border-danger/25 bg-danger/5 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
              <div>
                <p className="text-sm font-medium text-foreground">API unreachable</p>
                <p className="mt-1 text-xs text-muted-foreground">{error}</p>
              </div>
            </div>
            <button
              onClick={retry}
              disabled={retrying}
              className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm text-foreground transition-colors hover:border-primary/60 hover:text-primary disabled:opacity-60"
            >
              {retrying ? "Retrying" : "Retry"}
            </button>
          </div>
        ) : loading && !data ? (
          <div className="divide-y divide-foreground/5">
            <SkeletonTextRow />
            <SkeletonTextRow />
            <SkeletonTextRow />
          </div>
        ) : (
          <div className="divide-y divide-foreground/5">
            {data?.components.map((component) => (
              <div key={component.name} className="flex items-center justify-between gap-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-foreground/5 text-muted-foreground">
                    {component.name === "database" ? (
                      <DatabaseIcon className="h-4 w-4" />
                    ) : (
                      <CpuIcon className="h-4 w-4" />
                    )}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {component.name === "database" ? "PostgreSQL" : "Redis"}
                    </p>
                    {component.detail ? (
                      <p className="mt-0.5 max-w-[24rem] truncate text-xs text-muted-foreground" title={component.detail}>
                        {component.detail}
                      </p>
                    ) : (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {component.name === "database" ? "Laragon PostgreSQL on 5432" : "Redis 5 on 6380"}
                      </p>
                    )}
                  </div>
                </div>
                <StatusChip tone={component.status === "ok" ? "success" : "danger"} label={component.status} />
              </div>
            ))}

            {providers.map((provider) => (
              <div key={provider.provider} className="flex items-center justify-between gap-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-foreground/5 text-muted-foreground">
                    <BotIcon className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-foreground capitalize">{provider.provider}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{provider.detail}</p>
                  </div>
                </div>
                <StatusChip tone={provider.status === "healthy" ? "success" : "warning"} label={provider.status} />
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}