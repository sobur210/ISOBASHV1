import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { QueueService } from './queues/queue.service';

export type ComponentStatus = {
  name: 'database' | 'redis';
  status: 'ok' | 'error';
  detail?: string;
};

/**
 * Upper bound for the whole `/health` report, well under the supervisor's 6s
 * probe timeout (scripts/service.mjs `PROBE_TIMEOUT_MS`).
 *
 * The dependency checks are the unbounded part: a `prisma.$queryRaw` waits for
 * a pool connection for as long as `connect_timeout` allows, and the Redis ping
 * is bounded at 5s on its own. With Postgres down those two stack past the
 * probe timeout, the supervisor sees three consecutive aborts and kills an
 * otherwise healthy API — the process really was up, it just answered too
 * late. A liveness probe that can block longer than the probe budget is not a
 * liveness probe, so every check races a timer and the report is always
 * written within `HEALTH_BUDGET_MS`.
 */
const HEALTH_BUDGET_MS = Number(process.env.HEALTH_BUDGET_MS || 1_500);

function withTimeout<T>(promise: Promise<T>, ms: number, operation: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const guarded = promise.then(
    (value) => value,
    (error) => {
      throw error;
    },
  );
  // The race may already be settled by the timer when the real check rejects;
  // this handler keeps that late rejection from surfacing as unhandled.
  guarded.catch(() => undefined);
  return Promise.race([
    guarded,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${operation} timed out after ${ms}ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger('Health');

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
  ) {}

  async check(): Promise<{ status: string; service: string; timestamp: string; components: ComponentStatus[] }> {
    const [database, redis] = await Promise.all([this.checkDatabase(), this.checkRedis()]);
    const allOk = database.status === 'ok' && redis.status === 'ok';
    return {
      status: allOk ? 'ok' : 'degraded',
      service: 'isobash-api',
      timestamp: new Date().toISOString(),
      components: [database, redis],
    };
  }

  private async checkDatabase(): Promise<ComponentStatus> {
    try {
      await withTimeout(this.prisma.$queryRaw`SELECT 1`, HEALTH_BUDGET_MS, 'database check');
      return { name: 'database', status: 'ok' };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Database health check failed: ${detail}`);
      return { name: 'database', status: 'error', detail };
    }
  }

  private async checkRedis(): Promise<ComponentStatus> {
    try {
      const pong = await withTimeout(this.queue.ping(), HEALTH_BUDGET_MS, 'redis check');
      return pong === 'PONG' ? { name: 'redis', status: 'ok' } : { name: 'redis', status: 'error', detail: 'unexpected response' };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Redis health check failed: ${detail}`);
      return { name: 'redis', status: 'error', detail };
    }
  }
}
