"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { StatusChip } from "@/components/ui/status-chip";
import { Select } from "@/components/ui/input";
import {
  ActionButton,
  EmptyState,
  Notice,
  Panel,
  PanelBody,
  PanelFooter,
  PanelHeader,
  RefreshButton,
  TableWrap,
  Td,
  Th,
  Tr,
} from "@/components/admin/ui";
import { formatTimestamp } from "@/components/admin/format";
import { LockIcon, SearchIcon, ShieldIcon, UsersIcon } from "@/components/ui/icons";
import { SkeletonRows } from "@/components/ui/skeleton";
import {
  fetchAdminUsers,
  revokeAdminUserSessions,
  updateAdminUserPlan,
  updateAdminUserRole,
  type AdminUserList,
  type AdminUserSummary,
} from "@/lib/api";

type NoticeState = { tone: "success" | "danger"; text: string } | null;

/**
 * The real user directory.
 *
 * The API this reads has existed since the authorization phase; this panel is the
 * surface that was missing, not a capability invented for the console. Every
 * action is a real mutation with a real server-side rule behind it — the API
 * refuses an admin changing their own role and refuses demoting the last admin,
 * and this panel surfaces that message rather than hiding the button and hoping.
 */
export function AdminUsersPanel() {
  const [data, setData] = useState<AdminUserList | null>(null);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<"" | "ADMIN" | "USER">("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [notice, setNotice] = useState<NoticeState>(null);

  const load = useCallback(
    (signal?: AbortSignal) => {
      return fetchAdminUsers(
        { ...(search ? { q: search } : {}), ...(role ? { role } : {}), pageSize: 50 },
        signal,
      )
        .then((result) => {
          setData(result);
          setError(null);
        })
        .catch((err) => {
          if ((err as Error).name === "AbortError") return;
          setError(err instanceof Error ? err.message : "The user directory could not be read.");
        })
        .finally(() => setLoading(false));
    },
    [search, role],
  );

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    load().finally(() => setRefreshing(false));
  }, [load]);

  const run = useCallback(
    (userId: number, action: () => Promise<unknown>, success: string) => {
      setBusyId(userId);
      setNotice(null);
      action()
        .then(() => {
          setNotice({ tone: "success", text: success });
          load();
        })
        .catch((err) => setNotice({ tone: "danger", text: err instanceof Error ? err.message : "The change failed." }))
        .finally(() => setBusyId(null));
    },
    [load],
  );

  const onRole = useCallback(
    (user: AdminUserSummary) => {
      const next = user.role === "ADMIN" ? "USER" : "ADMIN";
      run(
        user.id,
        () => updateAdminUserRole(user.id, next),
        `${user.email} is now ${next === "ADMIN" ? "an administrator" : "a standard user"}.`,
      );
    },
    [run],
  );

  const onPlan = useCallback(
    (user: AdminUserSummary) => {
      const next = user.plan === "PRO" ? "FREE" : "PRO";
      run(
        user.id,
        () => updateAdminUserPlan(user.id, next, next === "PRO" ? "Granted from the admin console" : "Withdrawn"),
        `${user.email} is now on the ${next} plan.`,
      );
    },
    [run],
  );

  const onRevoke = useCallback(
    (user: AdminUserSummary) => {
      run(user.id, () => revokeAdminUserSessions(user.id), `Sessions revoked for ${user.email}.`);
    },
    [run],
  );

  const filtersActive = Boolean(search) || Boolean(role);

  return (
    <div className="space-y-5">
      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}

      <Panel>
        <PanelHeader
          title="Directory"
          description="Every registered account, with the three operations an administrator performs."
          icon={<UsersIcon className="h-4 w-4" />}
          meta={
            <>
              {data ? (
                <span className="font-mono text-[11px] text-muted-foreground">
                  {data.users.length} of {data.total}
                </span>
              ) : null}
              <RefreshButton busy={refreshing} onClick={refresh} />
            </>
          }
        />

        <PanelBody>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              setSearch(query.trim());
            }}
          >
            <label className="flex min-w-[220px] flex-1 flex-col gap-1.5">
              <span className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                Search
              </span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="email or name"
                className="h-9 rounded-lg border border-border bg-surface-2 px-3 text-[12.5px] text-foreground transition-colors placeholder:text-muted-foreground/70 hover:border-border-strong focus:border-primary/60 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                Role
              </span>
              <Select
                value={role}
                onChange={(event) => setRole(event.target.value as "" | "ADMIN" | "USER")}
                className="h-9 text-[12.5px]"
              >
                <option value="">All roles</option>
                <option value="ADMIN">Administrators</option>
                <option value="USER">Standard users</option>
              </Select>
            </label>
            <button
              type="submit"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3.5 text-[12.5px] font-medium text-foreground transition-colors hover:border-primary/50"
            >
              <SearchIcon className="h-3.5 w-3.5" />
              Apply
            </button>
            {filtersActive ? (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setSearch("");
                  setRole("");
                }}
                className="h-9 rounded-lg px-2 text-[12.5px] text-muted-foreground transition-colors hover:text-foreground"
              >
                Clear
              </button>
            ) : null}
          </form>
        </PanelBody>

        {loading && !data ? (
          <PanelBody>
            <SkeletonRows count={6} />
          </PanelBody>
        ) : data && data.users.length === 0 ? (
          <PanelBody>
            <EmptyState
              title="No account matches this view"
              description="The filter is a real query against the users table, so an empty result means nothing matched — not that the directory failed."
            />
          </PanelBody>
        ) : (
          <TableWrap className="pb-1">
            <thead>
              <tr className="border-b border-border">
                <Th>Account</Th>
                <Th>Role</Th>
                <Th>Plan</Th>
                <Th>MFA</Th>
                <Th className="text-right">Sessions</Th>
                <Th>Joined</Th>
                <Th>Last seen</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {data?.users.map((user) => (
                <Tr key={user.id} className="transition-colors hover:bg-surface-2/50">
                  <Td className="max-w-[26ch]">
                    <p className="truncate font-medium text-foreground">{user.email}</p>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {user.name ?? "no name"}
                    </p>
                  </Td>
                  <Td>
                    {user.role === "ADMIN" ? (
                      <Badge tone="primary">Admin</Badge>
                    ) : (
                      <Badge tone="neutral">User</Badge>
                    )}
                  </Td>
                  <Td>
                    <Badge tone={user.plan === "PRO" ? "accent" : "neutral"}>{user.plan}</Badge>
                  </Td>
                  <Td>
                    <StatusChip
                      tone={user.mfaEnabled ? "success" : "neutral"}
                      label={user.mfaEnabled ? "on" : "off"}
                    />
                  </Td>
                  <Td className="text-right font-mono tabular-nums text-foreground">
                    {user.activeSessions}
                  </Td>
                  <Td className="whitespace-nowrap text-muted-foreground">
                    {formatTimestamp(user.createdAt)}
                  </Td>
                  <Td className="whitespace-nowrap text-muted-foreground">
                    {user.lastLoginAt ? formatTimestamp(user.lastLoginAt) : "never"}
                  </Td>
                  <Td>
                    <div className="flex items-center justify-end gap-0.5">
                      <ActionButton
                        disabled={busyId === user.id}
                        onClick={() => onRole(user)}
                        icon={<ShieldIcon className="h-3.5 w-3.5" />}
                      >
                        {user.role === "ADMIN" ? "Make user" : "Make admin"}
                      </ActionButton>
                      <ActionButton disabled={busyId === user.id} onClick={() => onPlan(user)}>
                        {user.plan === "PRO" ? "Drop to Free" : "Grant Pro"}
                      </ActionButton>
                      <ActionButton
                        tone="danger"
                        disabled={busyId === user.id}
                        onClick={() => onRevoke(user)}
                        icon={<LockIcon className="h-3.5 w-3.5" />}
                      >
                        Revoke
                      </ActionButton>
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableWrap>
        )}

        {data ? (
          <PanelFooter>
            <span className="text-muted-foreground">
              Showing {data.users.length} of {data.total} account{data.total === 1 ? "" : "s"}
              {filtersActive ? " matching the current filter" : ""}. Every action here is authorized and audited
              server-side.
            </span>
          </PanelFooter>
        ) : null}
      </Panel>
    </div>
  );
}