"use client";

import { useEffect, useState } from "react";
import { StatusChip } from "@/components/ui/status-chip";
import { ActionButton, Notice, Panel, PanelBody, PanelFooter, PanelHeader } from "@/components/admin/ui";
import {
  ActivityIcon,
  BotIcon,
  CpuIcon,
  DatabaseIcon,
  RefreshIcon,
} from "@/components/ui/icons";
import { SkeletonRows } from "@/components/ui/skeleton";
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
  database: {
    label: "PostgreSQL",
    icon: <DatabaseIcon className="h-4 w-4" />,
    fallback: "The API reached the database",
  },
  redis: { label: "Redis", icon: <ActivityIcon className="h-4 w-4" />, fallback: "The API reached Redis" },
};

/**
 * Live infrastructure and provider state, straight from `/health` and
 * `/ai/providers/health`. Rows are a list rather than a grid of cards: this is a
 * status table, and it should stay readable at a glance without scrolling.
 */
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

  const rows = [
    ...(data?.components ?? []).map((component) => {
      const meta = infrastructure[component.name] ?? {
        label: component.name,
        icon: <CpuIcon className="h-4 w-4" />,
        fallback: "No detail reported.",
      };
      return {
        key: component.name,
        icon: meta.icon,
        label: meta.label,
        detail: component.detail ?? meta.fallback,
        tone: component.status === "ok" ? ("success" as const) : ("danger" as const),
        status: component.status,
      };
    }),
    ...providers.map((provider) => ({
      key: provider.provider,
      icon: <BotIcon className="h-4 w-4" />,
      label: provider.provider,
      detail: provider.detail ?? `${provider.capabilities.length} capabilities registered`,
      tone: provider.status === "healthy" ? ("success" as const) : ("warning" as const),
      status: provider.status,
    })),
  ];

  const failing = rows.filter((row) => row.tone !== "success").length;

  return (
    <Panel>
      <PanelHeader
        title="System status"
        description="Live from the API. Nothing here is simulated."
        icon={<ActivityIcon className="h-4 w-4" />}
        meta={
          <>
            {data ? (
              <StatusChip
                tone={failing === 0 ? "success" : "warning"}
                label={failing === 0 ? "all ok" : `${failing} degraded`}
              />
            ) : null}
            {lastUpdated ? (
              <span className="font-mono text-[11px] text-muted-foreground">
                {lastUpdated.toLocaleTimeString()}
              </span>
            ) : null}
          </>
        }
      />

      <PanelBody className="px-0 py-0">
        {error ? (
          <div className="px-5 py-4">
            <Notice tone="danger">{error}</Notice>
            <ActionButton
              className="mt-3"
              onClick={retry}
              disabled={retrying}
              icon={<RefreshIcon className={`h-3.5 w-3.5 ${retrying ? "animate-spin" : ""}`} />}
            >
              {retrying ? "Retrying" : "Retry"}
            </ActionButton>
          </div>
        ) : loading && !data ? (
          <div className="px-5 py-4">
            <SkeletonRows count={4} />
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((row) => (
              <li
                key={row.key}
                className="flex items-center justify-between gap-4 px-5 py-2.5 transition-colors hover:bg-surface-2/50"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="shrink-0 text-muted-foreground">{row.icon}</span>
                  <div className="min-w-0">
                    <p className="text-[12.5px] font-medium text-foreground">{row.label}</p>
                    <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground" title={row.detail}>
                      {row.detail}
                    </p>
                  </div>
                </div>
                <StatusChip tone={row.tone} label={row.status} />
              </li>
            ))}
          </ul>
        )}
      </PanelBody>

      <PanelFooter>
        <span className="font-mono text-[11px] text-muted-foreground">
          {data ? data.service : "api"} · auto-refresh every {REFRESH_MS / 1000}s
        </span>
      </PanelFooter>
    </Panel>
  );
}