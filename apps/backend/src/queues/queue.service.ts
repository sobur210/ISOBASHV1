import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { JobsOptions, Queue } from 'bullmq';
import Redis from 'ioredis';
import { InjectConfig } from '../shared/config/inject-config';
import { AppConfig } from '../shared/config/configuration';

const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 1000 },
  removeOnComplete: { age: 3600, count: 1000 },
  removeOnFail: { age: 86400 },
};

const STARTUP_PING_TIMEOUT_MS = Number(process.env.REDIS_STARTUP_TIMEOUT_MS || 10_000);
const COMMAND_TIMEOUT_MS = Number(process.env.REDIS_COMMAND_TIMEOUT_MS || 5_000);

export class RedisUnavailableError extends Error {
  constructor(operation: string, cause: unknown) {
    super(
      `Redis is unavailable for "${operation}": ${cause instanceof Error ? cause.message : String(cause)}. ` +
        'Queue operations are failing; fix Redis (see docs/LOCAL-DEVELOPMENT.md).',
    );
    this.name = 'RedisUnavailableError';
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, operation: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new RedisUnavailableError(operation, new Error(`no response within ${ms}ms`)));
    }, ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error instanceof RedisUnavailableError ? error : new RedisUnavailableError(operation, error));
      });
  });
}

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Queue');
  private readonly connection: Redis;
  private readonly queue: Queue;

  constructor(@InjectConfig() config: AppConfig) {
    this.connection = new Redis(config.redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      connectTimeout: 5_000,
      retryStrategy: (attempt) => Math.min(attempt * 500, 5_000),
    });
    this.connection.on('error', (error: Error) => {
      this.logger.warn(`Redis connection error: ${error.message}`);
    });
    this.queue = new Queue('isobash-queue', {
      connection: this.connection,
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });
  }

  /**
   * Bounded startup probe. `maxRetriesPerRequest: null` means a `ping()` against a
   * dead Redis never settles; awaiting it inside `onModuleInit` would block Nest's
   * init hook forever and the HTTP server would never bind its port (the API then
   * looks "unreachable" with no error anywhere). We wait a bounded amount of time,
   * log the real failure, and let the app boot in a degraded state so `/health`
   * reports the truth instead of the process dying silently.
   */
  async onModuleInit() {
    try {
      await withTimeout(this.connection.ping(), STARTUP_PING_TIMEOUT_MS, 'startup ping');
      this.logger.log('Redis connection ready');
    } catch (error) {
      this.logger.error(
        `Redis is not reachable at startup: ${error instanceof Error ? error.message : String(error)}. ` +
          'The API will start in a degraded state; queue-backed features will fail until Redis is running.',
      );
    }
  }

  getQueue(): Queue {
    return this.queue;
  }

  async addJob(name: string, data: unknown, options?: JobsOptions) {
    return withTimeout(this.queue.add(name, data, options), COMMAND_TIMEOUT_MS, `addJob(${name})`);
  }

  async ping(): Promise<string> {
    return withTimeout(this.connection.ping(), COMMAND_TIMEOUT_MS, 'ping');
  }

  async getJobCounts() {
    return withTimeout(this.queue.getJobCounts(), COMMAND_TIMEOUT_MS, 'getJobCounts');
  }

  async getWorkers() {
    return withTimeout(this.queue.getWorkers(), COMMAND_TIMEOUT_MS, 'getWorkers');
  }

  isReady(): boolean {
    return this.connection.status === 'ready';
  }

  async onModuleDestroy() {
    try {
      await this.queue.close();
      await this.connection.quit();
    } catch (error) {
      this.logger.warn(`Error during queue shutdown: ${error instanceof Error ? error.message : error}`);
    }
  }
}