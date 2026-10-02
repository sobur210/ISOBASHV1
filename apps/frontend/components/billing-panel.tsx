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
  RefreshIcon,
  ServerIcon,
} from "@/components/ui/icons";
import {
  downgradePlan,
  fetchBillingCapabilities,
  fetchBillingSubscription,
  fetchBillingUsage,
  type BillingCapabilities,
  type BillingSubscription,
  type BillingUsage,
} from "@/lib/api";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** exponent;
  return `${value >= 10 || exponent === 0 ? Math.round(value) : value.toFixed(1)} ${units[exponent]}`;
}

function formatCount(value: number): string {
  return value.toLocaleString();
}

/**
 * Phase 16 billing.
 *
 * Three rules this panel keeps:
 *
 *  1. **No checkout, because there is nothing to charge with.** The payment
 *     section renders the API's own `available: false` and its reason. There is
 *     no card field, no "upgrade" button that goes nowhere, and no price.
 *  2. **Usage is measured, so it is labelled as measured.** The bar is drawn from
 *     the live counts the API returns and shows the real limit; a metric with no
 *     plan limit says so instead of drawing a full bar.
 *  3. **Where a number came from is shown.** A limit inherited from the
 *     deployment is labelled "deployment", not presented as the plan's own.
 */
export function BillingPanel() {
  const [capabilities, setCapabilities] = useState<BillingCapabilities | null>(null);
  const [subscription, setSubscription] = useState<BillingSubscription | null>(null);
  const [usage, setUsage] = useState<BillingUsage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(
    (signal?: AbortSignal) => {
    Promise.all([
      fetchBillingCapabilities(signal),
      fetchBillingSubscription(signal),
      fetchBillingUsage(signal),
    ])
      .then(([caps, sub, use]) => {
        setCapabilities(caps);
        setSubscription(sub);
        setUsage(use);
        setError(null);
      })
      .catch((err) => {
        if ((err as Error).name === "AbortError") return;
        setError(err instanceof Error ? err.message : "The billing API is unreachable.");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const onDowngrade = useCallback(() => {
    setWorking(true);
    setNotice(null);
    downgradePlan()
      .then((next) => {
        setSubscription(next);
        setNotice("This account is back on the Free plan. The lower limits apply immediately.");
        return fetchBillingUsage().then(setUsage);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "The plan could not be changed."))
      .finally(() => setWorking(false));
  }, []);

  const onRefresh = useCallback(() => {
    setLoading(true);
    const controller = new AbortController();
    load(controller.signal);
  }, [load]);

  const plan = subscription?.plan ?? capabilities?.defaultPlan ?? "FREE";
  const planDefinition = capabilities?.plans.find((entry) => entry.key === plan);
  const canDowngrade = Boolean(subscription && !subscription.isDefault && capabilities?.selfService.downgrade);

  return (
    <div className="space-y-6">
      {error ? (
        <Card className="border-danger/40">
          <CardBody className="flex items-start gap-3">
            <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Billing could not be read</p>
              <p className="mt-1 text-[13px] leading-6 break-words text-muted-foreground">{error}</p>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {notice ? (
        <Card className="border-success/40">
          <CardBody className="flex items-start gap-3">
            <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            <p className="text-[13px] leading-6 text-muted-foreground">{notice}</p>
          </CardBody>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader
            title="Your plan"
            subtitle="The entitlement this account actually holds"
            icon={<CreditCardIcon className="h-4 w-4" />}
            action={
              <button
                type="button"
                onClick={onRefresh}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <RefreshIcon className="h-3 w-3" />
                Refresh
              </button>
            }
          />
          <CardBody className="space-y-4">
            {loading ? (
              <SkeletonTextRow rows={3} />
            ) : (
              <>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-2xl font-bold tracking-[-0.03em] text-foreground">
                      {subscription?.name ?? planDefinition?.name ?? plan}
                    </p>
                    {subscription?.isDefault ? <Badge tone="neutral">Default</Badge> : <Badge tone="primary">Granted</Badge>}
                  </div>
                  <p className="mt-2 text-[13px] leading-6 text-muted-foreground">
                    {subscription?.detail ?? planDefinition?.summary}
                  </p>
                </div>

                {subscription?.grantedBy ? (
                  <div className="rounded-xl border border-border bg-surface-2 px-3 py-2.5">
                    <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                      Granted by
                    </p>
                    <p className="mt-1 text-[13px] text-foreground">{subscription.grantedBy.email}</p>
                    {subscription.grantedAt ? (
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {new Date(subscription.grantedAt).toLocaleString()}
                      </p>
                    ) : null}
                    {subscription.note ? (
                      <p className="mt-1.5 text-[12px] leading-5 text-muted-foreground italic">
                        {subscription.note}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {canDowngrade ? (
                  <button
                    type="button"
                    onClick={onDowngrade}
                    disabled={working}
                    className="w-full rounded-xl border border-border px-4 py-2.5 text-[13px] font-medium text-foreground transition-colors hover:border-danger/50 hover:text-danger disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {working ? "Working…" : "Return to the Free plan"}
                  </button>
                ) : null}
              </>
            )}
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="Usage"
            subtitle={
              usage
                ? `Measured live at ${new Date(usage.measuredAt).toLocaleTimeString()}`
                : "Live counts over the records this account owns"
            }
            icon={<ActivityIcon className="h-4 w-4" />}
          />
          <CardBody className="space-y-4">
            {loading ? (
              <SkeletonTextRow rows={5} />
            ) : usage ? (
              <>
                <ul className="space-y-3.5">
                  {usage.metrics.map((metric) => {
                    const display = metric.unit === "bytes" ? formatBytes(metric.used) : formatCount(metric.used);
                    const percent =
                      metric.limit && metric.limit > 0
                        ? Math.min(100, Math.round((metric.used / metric.limit) * 100))
                        : null;
                    return (
                      <li key={metric.key}>
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-[13px] font-medium text-foreground">{metric.label}</span>
                          <span className="font-mono text-[12px] text-muted-foreground">
                            {display}
                            {metric.limit === null ? (
                              <span className="text-muted-foreground/70"> · no plan limit</span>
                            ) : (
                              <span>
                                {" "}/ {metric.unit === "bytes" ? formatBytes(metric.limit) : formatCount(metric.limit)}
                              </span>
                            )}
                          </span>
                        </div>
                        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              metric.atLimit ? "bg-danger" : percent !== null && percent > 75 ? "bg-warning" : "bg-primary"
                            }`}
                            style={{ width: `${percent ?? 0}%` }}
                          />
                        </div>
                        <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                          {metric.detail}
                          {metric.limitSource === "deployment" ? (
                            <span> Limit inherited from this deployment&apos;s configured maximum.</span>
                          ) : metric.limitSource === "plan" ? (
                            <span> Limit set by the {usage.plan} plan.</span>
                          ) : null}
                        </p>
                      </li>
                    );
                  })}
                </ul>
                <p className="text-[11px] leading-5 text-muted-foreground">{usage.detail}</p>
              </>
            ) : null}
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader
            title="Payment"
            subtitle="What can actually be charged here"
            icon={<CreditCardIcon className="h-4 w-4" />}
          />
          <CardBody className="space-y-3">
            {capabilities ? (
              <>
                <StatusChip
                  tone={capabilities.payment.available ? "success" : "warning"}
                  label={capabilities.payment.available ? "Processor configured" : "No processor configured"}
                />
                <p className="text-[13px] leading-6 text-muted-foreground">{capabilities.payment.detail}</p>
                <p className="text-[12px] leading-5 text-muted-foreground">
                  {capabilities.selfService.detail}
                </p>
              </>
            ) : (
              <SkeletonTextRow rows={3} />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Enforcement"
            subtitle="Where these limits are checked"
            icon={<ServerIcon className="h-4 w-4" />}
          />
          <CardBody className="space-y-3">
            {capabilities ? (
              <>
                <ul className="space-y-2">
                  {Object.entries(capabilities.enforced)
                    .filter(([key]) => key !== "note")
                    .map(([key, value]) => (
                      <li key={key} className="text-[12.5px] leading-6 text-muted-foreground">
                        {value}
                      </li>
                    ))}
                </ul>
                <p className="text-[11px] leading-5 text-muted-foreground">{capabilities.enforced.note}</p>
              </>
            ) : (
              <SkeletonTextRow rows={3} />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Plans" subtitle="The whole catalogue" icon={<CreditCardIcon className="h-4 w-4" />} />
          <CardBody className="space-y-3">
            {capabilities ? (
              capabilities.plans.map((entry) => (
                <div
                  key={entry.key}
                  className={`rounded-xl border px-3 py-3 ${
                    entry.key === plan ? "border-primary/50 bg-primary-soft" : "border-border"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[13px] font-semibold text-foreground">{entry.name}</p>
                    {entry.key === plan ? <Badge tone="primary">Current</Badge> : null}
                  </div>
                  <p className="mt-1.5 text-[12px] leading-5 text-muted-foreground">{entry.summary}</p>
                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[10.5px] text-muted-foreground">
                    <dt>files</dt>
                    <dd>{entry.limits.files ?? "deployment max"}</dd>
                    <dt>file bytes</dt>
                    <dd>{entry.limits.fileBytes ? formatBytes(entry.limits.fileBytes) : "deployment max"}</dd>
                    <dt>media</dt>
                    <dd>{entry.limits.mediaAssets ?? "deployment max"}</dd>
                    <dt>media bytes</dt>
                    <dd>{entry.limits.mediaBytes ? formatBytes(entry.limits.mediaBytes) : "deployment max"}</dd>
                  </dl>
                </div>
              ))
            ) : (
              <SkeletonTextRow rows={4} />
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}