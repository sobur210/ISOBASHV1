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
  ClockIcon,
  CpuIcon,
  DatabaseIcon,
  RefreshIcon,
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

const infrastructure: Record<string, { label: string; icon: React.ReactNode; fallback: string }> = {
  database: { label: "PostgreSQL", icon: <DatabaseIcon className="h-4 w-4" />, fallback: "Laragon PostgreSQL on 5432" },
  redis: { label: "Redis", icon: <ActivityIcon className="h-4 w-4" />, fallback: "Redis 5 on 6380" },
};

function Row({
  icon,
  label,
  detail,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  detail: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="flex min-w-0 items-center gap-3.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-2 text-muted-foreground">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-[13.5px] font-medium text-foreground">{label}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground" title={detail}>
            {detail}
          </p>
        </div>
      </div>
      {children}
    </div>
  );
}

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
                <p className="text-[13.5px] font-medium text-foreground">API unreachable</p>
                <p className="mt-1 text-xs text-muted-foreground">{error}</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={retry} disabled={retrying}>
              <RefreshIcon className="h-3.5 w-3.5" />
              {retrying ? "Retrying" : "Retry"}
            </Button>
          </div>
        ) : loading && !data ? (
          <SkeletonRows count={4} />
        ) : (
          <div className="divide-y divide-border">
            {data?.components.map((component) => {
              const meta = infrastructure[component.name] ?? {
                label: component.name,
                icon: <CpuIcon className="h-4 w-4" />,
                fallback: "No detail reported.",
              };
              return (
                <Row
                  key={component.name}
                  icon={meta.icon}
                  label={meta.label}
                  detail={component.detail ?? meta.fallback}
                >
                  <StatusChip
                    tone={component.status === "ok" ? "success" : "danger"}
                    label={component.status}
                  />
                </Row>
              );
            })}

            {providers.map((provider) => (
              <Row
                key={provider.provider}
                icon={<BotIcon className="h-4 w-4" />}
                label={provider.provider}
                detail={provider.detail ?? `${provider.capabilities.length} capabilities`}
              >
                <StatusChip
                  tone={provider.status === "healthy" ? "success" : "warning"}
                  label={provider.status}
                />
              </Row>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
