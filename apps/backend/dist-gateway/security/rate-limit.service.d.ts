import { OnModuleDestroy } from '@nestjs/common';
import { AppConfig } from '../shared/config/configuration';
export type RateResult = {
    allowed: boolean;
    remaining: number;
    retryAfterMs: number;
};
export declare class RateLimitService implements OnModuleDestroy {
    private readonly logger;
    private readonly redis;
    private redisDown;
    private nextRedisProbeAt;
    private readonly memory;
    constructor(config: AppConfig);
    /**
     * A single `retryStrategy: () => null` client never reconnects on its own, so a
     * Redis outage would silently pin this process to in-memory limiting until it is
     * restarted. Probe at most once every 30s and restore the Redis path when the
     * server is back, so rate limits stay shared across instances after recovery.
     */
    private redisRecovered;
    hit(bucket: string, limit: number, windowMs: number): Promise<RateResult>;
    onModuleDestroy(): Promise<void>;
}
