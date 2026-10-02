"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var ProviderHealthService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProviderHealthService = void 0;
const common_1 = require("@nestjs/common");
const provider_registry_1 = require("./provider.registry");
const HEALTH_TTL_MS = readNumber('AI_HEALTH_TTL_MS', 15_000);
const CIRCUIT_FAILURE_THRESHOLD = readNumber('AI_CIRCUIT_FAILURE_THRESHOLD', 3);
const CIRCUIT_COOLDOWN_MS = readNumber('AI_CIRCUIT_COOLDOWN_MS', 30_000);
const LATENCY_EWMA_ALPHA = 0.3;
/**
 * Phase 9: provider health cache, latency/reliability tracking and a real
 * circuit breaker.
 *
 * Purpose: routing decisions must be fast (no live probe per token) and honest
 * (a provider that is down is excluded, a provider that is flapping is given a
 * cooldown instead of being hammered on every request).
 */
let ProviderHealthService = ProviderHealthService_1 = class ProviderHealthService {
    registry;
    log = new common_1.Logger(ProviderHealthService_1.name);
    runtimes = new Map();
    constructor(registry) {
        this.registry = registry;
    }
    /** Current health, refreshed from the provider when the cache is stale. */
    async status(provider) {
        const runtime = this.runtime(provider);
        const stale = runtime.checkedAt === null || Date.now() - runtime.checkedAt > HEALTH_TTL_MS;
        if (!stale)
            return runtime.health;
        const instance = this.instance(provider);
        if (!instance) {
            runtime.health = {
                provider,
                status: 'unconfigured',
                capabilities: [],
                detail: 'No provider instance is registered under this name.',
            };
            runtime.checkedAt = Date.now();
            return runtime.health;
        }
        try {
            runtime.health = await instance.health();
        }
        catch (error) {
            runtime.health = {
                provider,
                status: 'unavailable',
                capabilities: [...instance.capabilities],
                detail: error instanceof Error ? error.message : 'Health check threw an unexpected error.',
            };
        }
        runtime.checkedAt = Date.now();
        return runtime.health;
    }
    /** Non-blocking snapshot used by the router when a fresh probe is not required. */
    cached(provider) {
        return this.runtime(provider).health;
    }
    circuit(provider) {
        const runtime = this.runtime(provider);
        if (runtime.circuit === 'open' && runtime.nextProbeAt !== null && Date.now() >= runtime.nextProbeAt) {
            runtime.circuit = 'half-open';
            runtime.probeInFlight = false;
        }
        return runtime.circuit;
    }
    allowsRequest(provider) {
        const state = this.circuit(provider);
        if (state === 'closed')
            return true;
        if (state === 'half-open') {
            const runtime = this.runtime(provider);
            if (runtime.probeInFlight)
                return false;
            runtime.probeInFlight = true;
            return true;
        }
        return false;
    }
    recordSuccess(provider, latencyMs) {
        const runtime = this.runtime(provider);
        runtime.successes += 1;
        runtime.totalRequests += 1;
        runtime.consecutiveFailures = 0;
        runtime.lastSuccessAt = new Date().toISOString();
        runtime.circuit = 'closed';
        runtime.openedAt = null;
        runtime.nextProbeAt = null;
        runtime.probeInFlight = false;
        runtime.avgLatencyMs = runtime.avgLatencyMs === null
            ? latencyMs
            : Math.round(runtime.avgLatencyMs * (1 - LATENCY_EWMA_ALPHA) + latencyMs * LATENCY_EWMA_ALPHA);
    }
    recordFailure(provider, code) {
        const runtime = this.runtime(provider);
        runtime.failures += 1;
        runtime.totalRequests += 1;
        runtime.consecutiveFailures += 1;
        runtime.lastFailureAt = new Date().toISOString();
        runtime.lastFailureCode = code;
        runtime.probeInFlight = false;
        // Only transport-level faults trip the breaker. A rate limit or a bad key is
        // a real answer from a working provider and must not hide it behind silence.
        if (isBreakerTripping(code) && runtime.consecutiveFailures >= CIRCUIT_FAILURE_THRESHOLD && runtime.circuit !== 'open') {
            runtime.circuit = 'open';
            runtime.openedAt = Date.now();
            runtime.nextProbeAt = Date.now() + CIRCUIT_COOLDOWN_MS;
            this.log.warn(`Circuit opened for provider "${provider}" after ${runtime.consecutiveFailures} failures (${code}).`);
        }
    }
    stats(provider) {
        const runtime = this.runtime(provider);
        const answered = runtime.successes + runtime.failures;
        return {
            provider,
            health: runtime.health.status,
            healthDetail: runtime.health.detail,
            circuit: this.circuit(provider),
            consecutiveFailures: runtime.consecutiveFailures,
            successRate: answered === 0 ? 1 : round(runtime.successes / answered),
            avgLatencyMs: runtime.avgLatencyMs,
            lastCheckedAt: runtime.checkedAt === null ? null : new Date(runtime.checkedAt).toISOString(),
            lastSuccessAt: runtime.lastSuccessAt,
            lastFailureAt: runtime.lastFailureAt,
            lastFailureCode: runtime.lastFailureCode,
            openedAt: runtime.openedAt === null ? null : new Date(runtime.openedAt).toISOString(),
            nextProbeAt: runtime.nextProbeAt === null ? null : new Date(runtime.nextProbeAt).toISOString(),
            totalRequests: runtime.totalRequests,
            totalFailures: runtime.failures,
        };
    }
    /** Non-blocking view: cached health only, for hot paths. */
    snapshot() {
        return this.registry
            .list()
            .map((health) => this.stats(health.provider))
            .map((stats) => ({ ...stats, health: this.cached(stats.provider).status, healthDetail: this.cached(stats.provider).detail }));
    }
    /** Truthful view: refreshes stale health before reporting (admin/routing APIs). */
    async snapshotWithHealth() {
        for (const health of this.registry.list()) {
            await this.status(health.provider);
        }
        return this.snapshot();
    }
    reset() {
        for (const runtime of this.runtimes.values()) {
            runtime.consecutiveFailures = 0;
            runtime.circuit = 'closed';
            runtime.openedAt = null;
            runtime.nextProbeAt = null;
            runtime.probeInFlight = false;
        }
    }
    runtime(provider) {
        let runtime = this.runtimes.get(provider);
        if (!runtime) {
            runtime = {
                health: { provider, status: 'unconfigured', capabilities: [], detail: 'Provider health has not been checked yet.' },
                checkedAt: null,
                circuit: 'closed',
                consecutiveFailures: 0,
                successes: 0,
                failures: 0,
                totalRequests: 0,
                avgLatencyMs: null,
                lastSuccessAt: null,
                lastFailureAt: null,
                openedAt: null,
                nextProbeAt: null,
                probeInFlight: false,
            };
            this.runtimes.set(provider, runtime);
        }
        return runtime;
    }
    instance(provider) {
        return this.registry.instance(provider);
    }
};
exports.ProviderHealthService = ProviderHealthService;
exports.ProviderHealthService = ProviderHealthService = ProviderHealthService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [provider_registry_1.AiProviderRegistry])
], ProviderHealthService);
function isBreakerTripping(code) {
    return ['PROVIDER_UNAVAILABLE', 'PROVIDER_STREAM_FAILED', 'PROVIDER_TIMEOUT', 'STREAM_INTERRUPTED', 'PROVIDER_REQUEST_FAILED'].includes(code);
}
function readNumber(name, fallback) {
    const raw = process.env[name];
    const parsed = raw === undefined ? Number.NaN : Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
function round(value) {
    return Math.round(value * 1000) / 1000;
}
//# sourceMappingURL=provider-health.service.js.map