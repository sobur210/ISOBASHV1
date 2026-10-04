"use client";

import { useCallback, useEffect, useState } from "react";
import { StatusChip } from "@/components/ui/status-chip";
import {
  EmptyState,
  KeyValue,
  KeyValueList,
  MetricGrid,
  Notice,
  Panel,
  PanelBody,
  PanelFooter,
  PanelHeader,
  RefreshButton,
  SectionLabel,
  TableWrap,
  Td,
  Th,
  Tr,
  type MetricSpec,
} from "@/components/admin/ui";
import {
  formatDuration,
  formatLimitValue,
  formatNumber,
  formatTimestamp,
  humanizeKey,
} from "@/components/admin/format";
import {
  ActivityIcon,
  ChatIcon,
  CreditCardIcon,
  DatabaseIcon,
  FileIcon,
  FolderIcon,
  SearchIcon,
  ServerIcon,
  UsersIcon,
} from "@/components/ui/icons";
import { SkeletonTextRow } from "@/components/ui/skeleton";
import {
  fetchAdminOverview,
  fetchAdminSettings,
  type AdminOverview,
  type AdminSettings,
  type AdminStorageRoots,
} from "@/lib/api";

/**
 * The deployment at a glance, and what it is configured to do.
 *
 * Everything here is a read. There is no toggle, because every setting behind one
 * is environment-driven: a switch that wrote a row would report a change the
 * running process had not applied, which is the one thing a console must never do.
 * Credentials appear as present or absent and are never echoed, not even partially.
 *
 * Layout rule: counts go in divided metric grids (they are a table of numbers),
 * configuration goes in definition rows, and providers and storage roots go in
 * tables. Nothing is boxed individually, so the eye scans rows instead of cards.
 */
export function AdminOverviewPanel({ section = "all" }: { section?: "all" | "settings" }) {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback((signal?: AbortSignal) => {
    return Promise.all([fetchAdminOverview(signal), fetchAdminSettings(signal)])
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

  const refresh = useCallback(() => {
    setRefreshing(true);
    load().finally(() => setRefreshing(false));
  }, [load]);

  const accounts = overview?.accounts;
  const content = overview?.content;

  const accountMetrics: MetricSpec[] = accounts
    ? [
        {
          key: "total",
          label: "Accounts",
          value: formatNumber(accounts.total),
          icon: <UsersIcon className="h-3.5 w-3.5" />,
          tone: "primary",
        },
        {
          key: "admins",
          label: "Administrators",
          value: formatNumber(accounts.admins),
          icon: <ServerIcon className="h-3.5 w-3.5" />,
          tone: accounts.admins === 0 ? "warning" : "neutral",
          hint: accounts.admins === 0 ? "nobody can reach this console" : undefined,
        },
        { key: "free", label: "On Free", value: formatNumber(accounts.onFree), icon: <CreditCardIcon className="h-3.5 w-3.5" /> },
        { key: "pro", label: "On Pro", value: formatNumber(accounts.onPro), icon: <CreditCardIcon className="h-3.5 w-3.5" /> },
        {
          key: "sessions",
          label: "Live sessions",
          value: formatNumber(accounts.activeSessions),
          icon: <ActivityIcon className="h-3.5 w-3.5" />,
        },
        {
          key: "new",
          label: "Joined in 24h",
          value: formatNumber(accounts.registeredLast24h),
          icon: <UsersIcon className="h-3.5 w-3.5" />,
        },
      ]
    : [];

  const contentMetrics: MetricSpec[] = content
    ? [
        { key: "projects", label: "Projects", value: formatNumber(content.projects), icon: <FolderIcon className="h-3.5 w-3.5" /> },
        { key: "conversations", label: "Conversations", value: formatNumber(content.conversations), icon: <ChatIcon className="h-3.5 w-3.5" /> },
        { key: "messages", label: "Messages", value: formatNumber(content.messages), icon: <ChatIcon className="h-3.5 w-3.5" /> },
        { key: "agents", label: "Agents", value: formatNumber(content.agents), icon: <ActivityIcon className="h-3.5 w-3.5" /> },
        { key: "runs", label: "Agent runs", value: formatNumber(content.agentRuns), icon: <ActivityIcon className="h-3.5 w-3.5" /> },
        { key: "research", label: "Research", value: formatNumber(content.researchSessions), icon: <SearchIcon className="h-3.5 w-3.5" /> },
        { key: "files", label: "Files", value: formatNumber(content.files), icon: <FileIcon className="h-3.5 w-3.5" /> },
        { key: "media", label: "Media assets", value: formatNumber(content.mediaAssets), icon: <FileIcon className="h-3.5 w-3.5" /> },
      ]
    : [];

  /**
   * `storage` carries the roots, the writability map and a sentence, so only the
   * string-valued entries are paths. Selecting on the value type narrows honestly
   * instead of filtering by key name and hoping the set of names stays the same.
   */
  const storageRoots = settings
    ? (Object.entries(settings.storage).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ) as [keyof AdminStorageRoots, string][])
    : [];

  return (
    <div className="space-y-5">
      {error ? <Notice tone="danger">{error}</Notice> : null}

      {section === "all" ? (
        <>
          <Panel>
            <PanelHeader
              title="Accounts"
              description="Counted live from the database on every load."
              icon={<UsersIcon className="h-4 w-4" />}
              meta={
                <>
                  {overview ? (
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {formatTimestamp(overview.generatedAt)}
                    </span>
                  ) : null}
                  <RefreshButton busy={refreshing} onClick={refresh} />
                </>
              }
            />
            {loading ? (
              <PanelBody>
                <SkeletonTextRow rows={3} />
              </PanelBody>
            ) : accountMetrics.length ? (
              <MetricGrid metrics={accountMetrics} columns={6} />
            ) : (
              <PanelBody>
                <EmptyState title="No counts returned" description="The overview response carried no account block." />
              </PanelBody>
            )}
            {overview ? <PanelFooter>{overview.detail}</PanelFooter> : null}
          </Panel>

          <Panel>
            <PanelHeader
              title="Content"
              description="What exists across every account on this deployment."
              icon={<DatabaseIcon className="h-4 w-4" />}
              meta={
                overview ? (
                  <span className="font-mono text-[11px] text-muted-foreground">
                    audit {formatNumber(overview.audit.last24h)} / 24h · {formatNumber(overview.audit.last7d)} / 7d
                  </span>
                ) : null
              }
            />
            {loading ? (
              <PanelBody>
                <SkeletonTextRow rows={3} />
              </PanelBody>
            ) : contentMetrics.length ? (
              <MetricGrid metrics={contentMetrics} columns={4} />
            ) : (
              <PanelBody>
                <EmptyState title="No counts returned" description="The overview response carried no content block." />
              </PanelBody>
            )}
          </Panel>
        </>
      ) : null}

      {section === "all" || section === "settings" ? (
        <>
          <div className="grid gap-5 xl:grid-cols-2">
            <Panel>
              <PanelHeader title="Runtime" description="The process serving this console." icon={<ServerIcon className="h-4 w-4" />} />
              <PanelBody>
                {loading ? (
                  <SkeletonTextRow rows={4} />
                ) : settings ? (
                  <KeyValueList>
                    <KeyValue label="Node" value={settings.runtime.node} />
                    <KeyValue label="Platform" value={`${settings.runtime.platform}`} />
                    <KeyValue label="Uptime" value={formatDuration(settings.runtime.uptimeSeconds)} />
                    <KeyValue label="API entry" value={settings.runtime.apiUrl} />
                    <KeyValue label="Web entry" value={settings.runtime.webUrl} />
                    <KeyValue
                      label="CORS origins"
                      value={
                        settings.runtime.corsOrigins.length
                          ? settings.runtime.corsOrigins.join(", ")
                          : "none configured"
                      }
                    />
                  </KeyValueList>
                ) : null}
              </PanelBody>
            </Panel>

            <Panel>
              <PanelHeader title="Queues" description="Redis-backed work, counted live." icon={<ActivityIcon className="h-4 w-4" />} />
              <PanelBody>
                {loading ? (
                  <SkeletonTextRow rows={4} />
                ) : settings ? (
                  <KeyValueList>
                    <KeyValue
                      label="Redis"
                      value={
                        <StatusChip
                          tone={settings.queues.ready ? "success" : "danger"}
                          label={settings.queues.ready ? "ready" : "down"}
                        />
                      }
                    />
                    <KeyValue label="Workers" value={settings.queues.workers ?? "unknown"} />
                    {settings.queues.counts
                      ? Object.entries(settings.queues.counts).map(([state, count]) => (
                          <KeyValue key={state} label={state} value={formatNumber(count)} />
                        ))
                      : null}
                  </KeyValueList>
                ) : null}
              </PanelBody>
              {settings ? (
                <PanelFooter>
                  <span className="text-muted-foreground">{settings.queues.detail}</span>
                </PanelFooter>
              ) : null}
            </Panel>
          </div>

          <Panel>
            <PanelHeader
              title="Providers"
              description="Every registered adapter, whether it is switched on, and whether a credential is present."
              icon={<ServerIcon className="h-4 w-4" />}
            />
            {loading ? (
              <PanelBody>
                <SkeletonTextRow rows={4} />
              </PanelBody>
            ) : settings && settings.providers.length ? (
              <TableWrap>
                <thead>
                  <tr className="border-b border-border">
                    <Th>Provider</Th>
                    <Th>State</Th>
                    <Th>Model</Th>
                    <Th>Credential</Th>
                    <Th>Base URL</Th>
                  </tr>
                </thead>
                <tbody>
                  {settings.providers.map((provider) => (
                    <Tr key={provider.provider}>
                      <Td className="font-medium text-foreground">{provider.provider}</Td>
                      <Td>
                        <StatusChip
                          tone={provider.enabled ? "success" : "neutral"}
                          label={provider.enabled ? "enabled" : "disabled"}
                        />
                      </Td>
                      <Td className="font-mono text-[11.5px] text-muted-foreground">
                        {provider.model}
                        {provider.embeddingModel ? (
                          <span className="text-muted-foreground/70"> · {provider.embeddingModel}</span>
                        ) : null}
                      </Td>
                      <Td>
                        <StatusChip
                          tone={provider.credentialPresent ? "primary" : "warning"}
                          label={
                            provider.credentialPresent
                              ? `${provider.credentialKind} present`
                              : "no credential"
                          }
                        />
                      </Td>
                      <Td className="max-w-[22ch] truncate font-mono text-[11.5px] text-muted-foreground">
                        {provider.baseUrl ?? "default endpoint"}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </TableWrap>
            ) : (
              <PanelBody>
                <EmptyState
                  title="No providers configured"
                  description="No adapter is enabled in this environment, so chat, embeddings and media have nothing to route to."
                />
              </PanelBody>
            )}
            {settings ? (
              <PanelFooter>
                <span className="text-muted-foreground">
                  Credentials are reported as present or absent only; the value is never returned. Registered
                  adapters:{" "}
                  <span className="font-mono text-foreground">
                    {settings.registeredProviders.join(", ") || "none"}
                  </span>
                  .
                </span>
              </PanelFooter>
            ) : null}
          </Panel>

          <div className="grid gap-5 xl:grid-cols-2">
            <Panel>
              <PanelHeader
                title="Storage roots"
                description="Probed with W_OK on every load, not assumed."
                icon={<DatabaseIcon className="h-4 w-4" />}
              />
              {loading ? (
                <PanelBody>
                  <SkeletonTextRow rows={5} />
                </PanelBody>
              ) : settings ? (
                <TableWrap>
                  <thead>
                    <tr className="border-b border-border">
                      <Th>Root</Th>
                      <Th>Path</Th>
                      <Th className="text-right">Writable</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {storageRoots.map(([root, path]) => {
                      const writable = settings.storage.writable[root];
                      return (
                        <Tr key={root}>
                          <Td className="whitespace-nowrap font-medium text-foreground">
                            {humanizeKey(root)}
                          </Td>
                          <Td className="max-w-[26ch] truncate font-mono text-[11.5px] text-muted-foreground" title={path}>
                            {path}
                          </Td>
                          <Td className="text-right">
                            <StatusChip
                              tone={writable === true ? "success" : writable === false ? "danger" : "neutral"}
                              label={
                                writable === true ? "yes" : writable === false ? "no" : "not probed"
                              }
                            />
                          </Td>
                        </Tr>
                      );
                    })}
                  </tbody>
                </TableWrap>
              ) : null}
              {settings ? (
                <PanelFooter>
                  <span className="text-muted-foreground">{settings.storage.detail}</span>
                </PanelFooter>
              ) : null}
            </Panel>

            <Panel>
              <PanelHeader
                title="Enforced limits"
                description="The ceilings the running process enforces, as configured."
                icon={<ServerIcon className="h-4 w-4" />}
              />
              <PanelBody className="space-y-4">
                {loading ? (
                  <SkeletonTextRow rows={6} />
                ) : settings ? (
                  Object.entries(settings.limits).map(([group, entries]) => (
                    <div key={group}>
                      <SectionLabel>{humanizeKey(group)}</SectionLabel>
                      <KeyValueList className="mt-1.5">
                        {Object.entries(entries).map(([key, value]) => (
                          <KeyValue key={key} label={humanizeKey(key)} value={formatLimitValue(key, value)} />
                        ))}
                      </KeyValueList>
                    </div>
                  ))
                ) : null}
              </PanelBody>
            </Panel>
          </div>

          {settings ? <Notice tone="info">{settings.detail}</Notice> : null}
        </>
      ) : null}
    </div>
  );
}