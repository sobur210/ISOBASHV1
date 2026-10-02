import { AiProviderHealth } from './provider.types';
import { AiProviderRegistry } from './provider.registry';
import { CircuitState, ProviderRuntimeStats } from './routing.types';
/**
 * Phase 9: provider health cache, latency/reliability tracking and a real
 * circuit breaker.
 *
 * Purpose: routing decisions must be fast (no live probe per token) and honest
 * (a provider that is down is excluded, a provider that is flapping is given a
 * cooldown instead of being hammered on every request).
 */
export declare class ProviderHealthService {
    private readonly registry;
    private readonly log;
    private readonly runtimes;
    constructor(registry: AiProviderRegistry);
    /** Current health, refreshed from the provider when the cache is stale. */
    status(provider: string): Promise<AiProviderHealth>;
    /** Non-blocking snapshot used by the router when a fresh probe is not required. */
    cached(provider: string): AiProviderHealth;
    circuit(provider: string): CircuitState;
    allowsRequest(provider: string): boolean;
    recordSuccess(provider: string, latencyMs: number): void;
    recordFailure(provider: string, code: string): void;
    stats(provider: string): ProviderRuntimeStats;
    /** Non-blocking view: cached health only, for hot paths. */
    snapshot(): ProviderRuntimeStats[];
    /** Truthful view: refreshes stale health before reporting (admin/routing APIs). */
    snapshotWithHealth(): Promise<ProviderRuntimeStats[]>;
    reset(): void;
    private runtime;
    private instance;
}
