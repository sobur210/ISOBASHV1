import { AiCapability, AiMode, AiProviderHealth } from './provider.types';

/**
 * Phase 9 — AI orchestration and model routing contracts.
 *
 * A route is always explainable: every candidate carries the signals that
 * produced its score and the reason it was admitted or rejected. Nothing in the
 * router is allowed to report success it did not obtain (master spec 62), so the
 * plan is returned alongside the result for auditing.
 */
export type CircuitState = 'closed' | 'open' | 'half-open';

export type ProviderRuntimeStats = {
  provider: string;
  health: AiProviderHealth['status'];
  healthDetail?: string;
  circuit: CircuitState;
  consecutiveFailures: number;
  successRate: number;
  avgLatencyMs: number | null;
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastFailureCode?: string;
  openedAt?: string | null;
  nextProbeAt?: string | null;
  totalRequests: number;
  totalFailures: number;
};

export type RouteCandidate = {
  provider: string;
  model: string;
  capabilities: AiCapability[];
  modes: AiMode[];
  health: AiProviderHealth['status'];
  circuit: CircuitState;
  avgLatencyMs: number | null;
  successRate: number;
  score: number;
  eligible: boolean;
  reasons: string[];
};

export type RouteRequest = {
  capability: AiCapability;
  mode?: AiMode;
  /** Explicit provider or `provider:model` selection made by the caller. */
  model?: string;
  metadata?: Record<string, string>;
};

export type RoutePlan = {
  request: RouteRequest;
  /** True when the caller pinned a provider: no cross-provider failover is allowed. */
  strict: boolean;
  selected: RouteCandidate | null;
  candidates: RouteCandidate[];
  decidedAt: string;
  explanation: string;
};

export type RouteOutcome = {
  provider: string;
  model: string;
  attempts: Array<{ provider: string; model: string; outcome: 'success' | 'failed'; code?: string; durationMs: number }>;
  failoverUsed: boolean;
  durationMs: number;
};

/**
 * Provider error codes that justify trying the next eligible candidate.
 *
 * Failover is deliberately conservative. A rate limit, a rejected key, a retired
 * model or an overloaded provider are all *real answers from the provider*: the
 * router must surface them instead of quietly producing a different answer from
 * a different vendor. Only transport-level failures and empty responses are
 * treated as "this candidate could not answer".
 */
export const FAILOVER_ALLOWED_CODES: ReadonlySet<string> = new Set([
  'PROVIDER_UNAVAILABLE',
  'PROVIDER_STREAM_FAILED',
  'EMPTY_PROVIDER_RESPONSE',
  'PROVIDER_TIMEOUT',
  'STREAM_INTERRUPTED',
]);

/** Codes that must be reported to the caller verbatim, without failover. */
export const FAILOVER_BLOCKED_CODES: ReadonlySet<string> = new Set([
  'RATE_LIMITED',
  'INVALID_API_KEY',
  'PROVIDER_NOT_CONFIGURED',
  'MODEL_NOT_AVAILABLE',
  'PROVIDER_OVERLOADED',
  'CAPABILITY_UNSUPPORTED',
  'STREAM_ABORTED',
]);

export function isFailoverAllowed(code: string | undefined): boolean {
  if (!code) return false;
  return FAILOVER_ALLOWED_CODES.has(code);
}
