"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusChip } from "@/components/ui/status-chip";
import { SkeletonTextRow } from "@/components/ui/skeleton";
import {
  ActivityIcon,
  AlertTriangleIcon,
  CheckIcon,
  CreditCardIcon,
  DatabaseIcon,
  FileIcon,
  FolderIcon,
  ChatIcon,
  RefreshIcon,
  SearchIcon,
  ServerIcon,
  UsersIcon,
} from "@/components/ui/icons";
import {
  fetchAdminOverview,
  fetchAdminSettings,
  type AdminOverview,
  type AdminSettings,
} from "@/lib/api";

/**
 * Phase 17 admin center: the deployment at a glance and what it is configured to
 * do.
 *
 * Everything on this page is a read. There is no toggle, because every setting
 * behind it is environment-driven: a switch that wrote a row would report a change
 * the running process had not applied, which is the one thing an admin console
 * must not do. Credentials are shown as present or absent and never echoed, not
 * even partially.
 */
export function AdminOverviewPanel({ section = "all" }: { section?: "all" | "settings" }) {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    (signal?: AbortSignal) => {
    Promise.all([fetchAdminOverview(signal), fetchAdminSettings(signal)])
      .then(([view, config]) => {
        setOverview(view);
        setSettings(config);
        setError(null);
      })
      .catch((err) => {
        if ((err as Error).name === "AbortError") return;
        setError(err instanceof Error ? err.message : "The admin API is unreachable.");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const accounts = overview?.accounts;
  const content = overview?.content;

  const accountStats: { label: string; value: number; icon: React.ReactNode }[] = accounts
    ? [
        { label: "Accounts", value: accounts.total, icon: <UsersIcon className="h-4 w-4" /> },
        { label: "Administrators", value: accounts.admins, icon: <ServerIcon className="h-4 w-4" /> },
        { label: "On Free", value: accounts.onFree, icon: <CreditCardIcon className="h-4 w-4" /> },
        { label: "On Pro", value: accounts.onPro, icon: <CreditCardIcon className="h-4 w-4" /> },
        { label: "Live sessions", value: accounts.activeSessions, icon: <ActivityIcon className="h-4 w-4" /> },
        { label: "Joined (24h)", value: accounts.registeredLast24h, icon: <UsersIcon className="h-4 w-4" /> },
      ]
    : [];

  const contentStats: { label: string; value: number; icon: React.ReactNode }[] = content
    ? [
        { label: "Projects", value: content.projects, icon: <FolderIcon className="h-4 w-4" /> },
        { label: "Conversations", value: content.conversations, icon: <ChatIcon className="h-4 w-4" /> },
        { label: "Messages", value: content.messages, icon: <ChatIcon className="h-4 w-4" /> },
        { label: "Agents", value: content.agents, icon: <ActivityIcon className="h-4 w-4" /> },
        { label: "Agent runs", value: content.agentRuns, icon: <ActivityIcon className="h-4 w-4" /> },
        { label: "Research sessions", value: content.researchSessions, icon: <SearchIcon className="h-4 w-4" /> },
        { label: "Stored files", value: content.files, icon: <FileIcon className="h-4 w-4" /> },
        { label: "Media assets", value: content.mediaAssets, icon: <FileIcon className="h-4 w-4" /> },
      ]
    : [];

  return (
    <div className="space-y-6">
      {error ? (
        <Card className="border-danger/40">
          <CardBody className="flex items-start gap-3">
            <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">The admin overview could not be read</p>
              <p className="mt-1 text-[13px] leading-6 break-words text-muted-foreground">{error}</p>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {section === "all" ? (
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Accounts"
            subtitle={overview ? `Counted at ${new Date(overview.generatedAt).toLocaleTimeString()}` : "Live counts"}
            icon={<UsersIcon className="h-4 w-4" />}
            action={
              <button
                type="button"
                onClick={() => {
                  setLoading(true);
                  load();
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <RefreshIcon className="h-3 w-3" />
                Refresh
              </button>
            }
          />
          <CardBody>
            {loading ? (
              <SkeletonTextRow rows={3} />
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {accountStats.map((stat) => (
                  <li key={stat.label} className="rounded-xl border border-border bg-surface-2 px-3 py-2.5">
                    <span className="text-muted-foreground">{stat.icon}</span>
                    <p className="mt-1.5 font-mono text-xl font-semibold text-foreground">{stat.value}</p>
                    <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{stat.label}</p>
                  </li>
                ))}
              </ul>
            )}
            {overview ? (
              <p className="mt-3 text-[11px] leading-5 text-muted-foreground">{overview.detail}</p>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Content" subtitle="What exists across every account" icon={<DatabaseIcon className="h-4 w-4" />} />
          <CardBody>
            {loading ? (
              <SkeletonTextRow rows={3} />
            ) : (
              <>
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {contentStats.map((stat) => (
                    <li key={stat.label} className="rounded-xl border border-border bg-surface-2 px-3 py-2.5">
                      <span className="text-muted-foreground">{stat.icon}</span>
                      <p className="mt-1.5 font-mono text-xl font-semibold text-foreground">{stat.value}</p>
                      <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{stat.label}</p>
                    </li>
                  ))}
                </ul>
                {overview ? (
                  <p className="mt-3 text-[11px] leading-5 text-muted-foreground">
                    Audit events recorded in the last 24 hours: <span className="font-mono">{overview.audit.last24h}</span>.
                    Last 7 days: <span className="font-mono">{overview.audit.last7d}</span>.
                  </p>
                ) : null}
              </>
            )}
          </CardBody>
        </Card>
      </div>

      ) : null}

      {section === "all" || section === "settings" ? (
      <Card>
        <CardHeader
          title="Configuration"
          subtitle="What this deployment is set up to do"
          icon={<ServerIcon className="h-4 w-4" />}
          action={settings ? <Badge tone="warning">Read-only</Badge> : null}
        />
        <CardBody className="space-y-5">
          {loading ? (
            <SkeletonTextRow rows={5} />
          ) : settings ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-border px-3 py-3">
                  <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">Runtime</p>
                  <dl className="mt-2 space-y-1.5 text-[12px]">
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">Node</dt>
                      <dd className="font-mono text-foreground">{settings.runtime.node}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">Platform</dt>
                      <dd className="font-mono text-foreground">{settings.runtime.platform}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">Uptime</dt>
                      <dd className="font-mono text-foreground">{Math.round(settings.runtime.uptimeSeconds / 60)} min</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">Public entry</dt>
                      <dd className="font-mono text-foreground">{settings.runtime.webUrl}</dd>
                    </div>
                  </dl>
                </div>

                <div className="rounded-xl border border-border px-3 py-3">
                  <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">Queues</p>
                  <dl className="mt-2 space-y-1.5 text-[12px]">
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">Redis</dt>
                      <dd>
                        <StatusChip tone={settings.queues.ready ? "success" : "danger"} label={settings.queues.ready ? "ready" : "down"} />
                      </dd>
                    </div>
                    {settings.queues.counts
                      ? Object.entries(settings.queues.counts).map(([state, count]) => (
                          <div key={state} className="flex justify-between gap-3">
                            <dt className="text-muted-foreground">{state}</dt>
                            <dd className="font-mono text-foreground">{count}</dd>
                          </div>
                        ))
                      : null}
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">Workers</dt>
                      <dd className="font-mono text-foreground">{settings.queues.workers ?? "unknown"}</dd>
                    </div>
                  </dl>
                </div>
              </div>

              <div>
                <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">Providers</p>
                <ul className="mt-2 space-y-2">
                  {settings.providers.map((provider) => (
                    <li
                      key={provider.provider}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2.5"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-medium text-foreground">{provider.provider}</span>
                        <StatusChip
                          tone={provider.enabled ? "success" : "neutral"}
                          label={provider.enabled ? "enabled" : "disabled"}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] text-muted-foreground">{provider.model}</span>
                        <Badge tone={provider.credentialPresent ? "neutral" : "warning"}>
                          {provider.credentialPresent ? `${provider.credentialKind} present` : "no credential"}
                        </Badge>
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
                  A credential is reported as present or absent only. The value is never returned, not even partially.
                  Registered provider adapters:{" "}
                  <span className="font-mono">{settings.registeredProviders.join(", ") || "none"}</span>.
                </p>
              </div>

              <div>
                <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">Storage roots</p>
                <ul className="mt-2 space-y-1">
                  {Object.entries(settings.storage)
                    .filter(([key]) => key !== "detail")
                    .map(([key, value]) => (
                      <li key={key} className="flex justify-between gap-3 text-[12px]">
                        <span className="text-muted-foreground">{key}</span>
                        <span className="truncate font-mono text-foreground">{value}</span>
                      </li>
                    ))}
                </ul>
                <p className="mt-2 text-[11px] leading-5 text-muted-foreground">{settings.storage.detail}</p>
              </div>

              <p className="flex items-start gap-2 rounded-xl border border-warning/40 bg-surface-2 px-3 py-2.5 text-[12px] leading-6 text-muted-foreground">
                <CheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                {settings.detail}
              </p>
            </>
          ) : null}
        </CardBody>
      </Card>
      ) : null}
    </div>
  );
}