"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusChip } from "@/components/ui/status-chip";
import { SkeletonTextRow } from "@/components/ui/skeleton";
import {
  AlertTriangleIcon,
  CheckIcon,
  LockIcon,
  RefreshIcon,
  SearchIcon,
  ShieldIcon,
  UsersIcon,
} from "@/components/ui/icons";
import {
  fetchAdminUsers,
  revokeAdminUserSessions,
  updateAdminUserPlan,
  updateAdminUserRole,
  type AdminUserList,
  type AdminUserSummary,
} from "@/lib/api";

type Notice = { tone: "success" | "danger"; text: string } | null;

/**
 * Phase 17 admin center: the real user directory.
 *
 * The API this reads has existed since the authorization phase; this panel is the
 * surface that was missing, not a new capability invented for the console. Every
 * action here is a real mutation with a real server-side rule behind it — the API
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
  const [busyId, setBusyId] = useState<number | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  const load = useCallback(
    (signal?: AbortSignal) => {
      fetchAdminUsers(
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

  return (
    <div className="space-y-6">
      {notice ? (
        <Card className={notice.tone === "danger" ? "border-danger/40" : "border-success/40"}>
          <CardBody className="flex items-start gap-3">
            {notice.tone === "danger" ? (
              <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
            ) : (
              <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            )}
            <p className="text-[13px] leading-6 break-words text-muted-foreground">{notice.text}</p>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title="Directory"
          subtitle={
            data ? `${data.total} account(s) match this view` : "Every registered account"
          }
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
        <CardBody className="space-y-4">
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              setSearch(query.trim());
            }}
          >
            <label className="flex min-w-[220px] flex-1 flex-col gap-1.5">
              <span className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                Search email or name
              </span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="any@account"
                className="rounded-xl border border-border bg-surface-2 px-3 py-2 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/50"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">Role</span>
              <select
                value={role}
                onChange={(event) => {
                  setRole(event.target.value as "" | "ADMIN" | "USER");
                }}
                className="rounded-xl border border-border bg-surface-2 px-3 py-2 text-[13px] text-foreground outline-none focus:border-primary/50"
              >
                <option value="">All roles</option>
                <option value="ADMIN">Administrators</option>
                <option value="USER">Standard users</option>
              </select>
            </label>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3.5 py-2 text-[13px] font-medium text-foreground transition-colors hover:border-primary/50"
            >
              <SearchIcon className="h-3.5 w-3.5" />
              Apply
            </button>
          </form>

          {error ? (
            <p className="text-[13px] leading-6 text-danger">{error}</p>
          ) : loading ? (
            <SkeletonTextRow rows={5} />
          ) : data && data.users.length === 0 ? (
            <p className="text-[13px] leading-6 text-muted-foreground">
              No account matches this search. The filter is a real query against the users table.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-border">
                    {["Account", "Role", "Plan", "MFA", "Sessions", "Last seen", ""].map((heading) => (
                      <th
                        key={heading}
                        className="px-3 py-2 font-mono text-[10px] font-medium tracking-[0.14em] text-muted-foreground uppercase"
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data?.users.map((user) => (
                    <tr key={user.id} className="border-b border-border/60 last:border-0">
                      <td className="px-3 py-3">
                        <p className="text-[13px] font-medium text-foreground">{user.email}</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {user.name ?? "no name"} · joined {new Date(user.createdAt).toLocaleDateString()}
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        {user.role === "ADMIN" ? (
                          <Badge tone="primary">Admin</Badge>
                        ) : (
                          <Badge tone="neutral">User</Badge>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <Badge tone={user.plan === "PRO" ? "accent" : "neutral"}>{user.plan}</Badge>
                      </td>
                      <td className="px-3 py-3">
                        <StatusChip
                          tone={user.mfaEnabled ? "success" : "neutral"}
                          label={user.mfaEnabled ? "on" : "off"}
                        />
                      </td>
                      <td className="px-3 py-3 font-mono text-[12px] text-foreground">{user.activeSessions}</td>
                      <td className="px-3 py-3 text-[12px] text-muted-foreground">
                        {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "never"}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <button
                            type="button"
                            disabled={busyId === user.id}
                            onClick={() => onRole(user)}
                            className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                          >
                            <ShieldIcon className="h-3 w-3" />
                            {user.role === "ADMIN" ? "Make user" : "Make admin"}
                          </button>
                          <button
                            type="button"
                            disabled={busyId === user.id}
                            onClick={() => onPlan(user)}
                            className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                          >
                            {user.plan === "PRO" ? "Drop to Free" : "Grant Pro"}
                          </button>
                          <button
                            type="button"
                            disabled={busyId === user.id}
                            onClick={() => onRevoke(user)}
                            className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-danger disabled:opacity-50"
                          >
                            <LockIcon className="h-3 w-3" />
                            Revoke
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}