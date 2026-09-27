import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { InjectConfig } from '../shared/config/inject-config';
import { AppConfig } from '../shared/config/configuration';

export type RateResult = {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
};

type MemoryRecord = { count: number; resetAt: number };

@Injectable()
export class RateLimitService implements OnModuleDestroy {
  private readonly logger = new Logger('RateLimit');
  private readonly redis: Redis | null;
  private redisDown = false;
  private nextRedisProbeAt = 0;
  private readonly memory = new Map<string, MemoryRecord>();

  constructor(@InjectConfig() config: AppConfig) {
    this.redis = new Redis(config.redisUrl, {
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      retryStrategy: () => null,
    });
    this.redis.on('error', () => {
      if (!this.redisDown) {
        this.redisDown = true;
        this.logger.warn('Redis rate limits unavailable; falling back to in-memory limiting.');
      }
    });
  }

  /**
   * A single `retryStrategy: () => null` client never reconnects on its own, so a
   * Redis outage would silently pin this process to in-memory limiting until it is
   * restarted. Probe at most once every 30s and restore the Redis path when the
   * server is back, so rate limits stay shared across instances after recovery.
   */
  private async redisRecovered(): Promise<boolean> {
    if (!this.redis) return false;
    const now = Date.now();
    if (now < this.nextRedisProbeAt) return false;
    this.nextRedisProbeAt = now + 30_000;
    try {
      const pong = await this.redis.ping();
      if (pong === 'PONG') {
        this.redisDown = false;
        this.logger.log('Redis rate limits restored.');
        return true;
      }
    } catch {
      // Still down; the next probe happens after the cooldown.
    }
    return false;
  }

  async hit(bucket: string, limit: number, windowMs: number): Promise<RateResult> {
    if (this.redis && this.redisDown) {
      await this.redisRecovered();
    }
    if (this.redis && !this.redisDown) {
      try {
        const key = `rl:${bucket}`;
        const count = await this.redis.incr(key);
        if (count === 1) {
          await this.redis.expire(key, Math.ceil(windowMs / 1000));
        }
        const ttl = await this.redis.ttl(key);
        return {
          allowed: count <= limit,
          remaining: Math.max(0, limit - count),
          retryAfterMs: Math.max(0, ttl) * 1000,
        };
      } catch (error) {
        this.redisDown = true;
        this.logger.warn(`Rate limit redis call failed: ${error instanceof Error ? error.message : error}`);
      }
    }

    const now = Date.now();
    let record = this.memory.get(bucket);
    if (!record || record.resetAt <= now) {
      record = { count: 0, resetAt: now + windowMs };
      this.memory.set(bucket, record);
    }
    record.count += 1;
    if (record.count > 1_000_000) {
      record.count = 1;
      record.resetAt = now + windowMs;
    }
    return {
      allowed: record.count <= limit,
      remaining: Math.max(0, limit - record.count),
      retryAfterMs: Math.max(0, record.resetAt - now),
    };
  }

  async onModuleDestroy() {
    try {
      await this.redis?.quit();
    } catch {
      // best-effort shutdown
    }
  }
}