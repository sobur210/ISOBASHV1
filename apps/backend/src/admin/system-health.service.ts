import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queues/queue.service';
import { InjectConfig } from '../shared/config/inject-config';
import { AppConfig } from '../shared/config/configuration';

export type SystemComponentStatus = {
  name: string;
  status: 'ok' | 'error';
  detail?: string;
  latencyMs?: number;
};

export type SystemHealthResult = {
  status: 'ok' | 'degraded';
  service: string;
  timestamp: string;
  components: SystemComponentStatus[];
};

const HTTP_TIMEOUT_MS = 5_000;

function timeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  controller.signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
  return controller.signal;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms.`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

@Injectable()
export class SystemHealthService {
  private readonly logger = new Logger('SystemHealth');

  constructor(
    @InjectConfig() private readonly config: AppConfig,
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
  ) {}

  async checkAll(): Promise<SystemHealthResult> {
    const started = Date.now();
    const [frontend, database, redis, jobQueue, ollama] = await Promise.all([
      this.checkFrontend(),
      this.checkDatabase(),
      this.checkRedis(),
      this.checkJobQueue(),
      this.checkOllama(),
    ]);

    const components: SystemComponentStatus[] = [
      frontend,
      {
        name: 'backend',
        status: 'ok',
        detail: 'API responding (HTTP 200).',
        latencyMs: Date.now() - started,
      },
      database,
      redis,
      jobQueue,
      ollama,
    ];

    const allOk = components.every((component) => component.status === 'ok');
    return {
      status: allOk ? 'ok' : 'degraded',
      service: 'isobash-api',
      timestamp: new Date().toISOString(),
      components,
    };
  }

  private async checkFrontend(): Promise<SystemComponentStatus> {
    const started = Date.now();
    try {
      const response = await fetch(this.config.webUrl, { signal: timeoutSignal(HTTP_TIMEOUT_MS) });
      return {
        name: 'frontend',
        status: response.ok ? 'ok' : 'error',
        detail: response.ok ? 'Next.js is serving the web app.' : `Frontend returned HTTP ${response.status}.`,
        latencyMs: Date.now() - started,
      };
    } catch (error) {
      this.logger.error(`Frontend health check failed: ${error instanceof Error ? error.message : error}`);
      return {
        name: 'frontend',
        status: 'error',
        detail: error instanceof Error ? error.message : 'unreachable',
        latencyMs: Date.now() - started,
      };
    }
  }

  private async checkDatabase(): Promise<SystemComponentStatus> {
    const started = Date.now();
    try {
      await withTimeout(this.prisma.$queryRaw`SELECT 1`, HTTP_TIMEOUT_MS, 'Database');
      return {
        name: 'database',
        status: 'ok',
        detail: 'PostgreSQL reachable (SELECT 1).',
        latencyMs: Date.now() - started,
      };
    } catch (error) {
      this.logger.error(`Database health check failed: ${error instanceof Error ? error.message : error}`);
      return {
        name: 'database',
        status: 'error',
        detail: error instanceof Error ? error.message : 'unreachable',
        latencyMs: Date.now() - started,
      };
    }
  }

  private async checkRedis(): Promise<SystemComponentStatus> {
    const started = Date.now();
    try {
      const pong = await withTimeout(this.queue.ping(), HTTP_TIMEOUT_MS, 'Redis');
      const ok = pong === 'PONG';
      return {
        name: 'redis',
        status: ok ? 'ok' : 'error',
        detail: ok ? 'Redis reachable (PONG).' : 'Redis returned an unexpected response.',
        latencyMs: Date.now() - started,
      };
    } catch (error) {
      this.logger.error(`Redis health check failed: ${error instanceof Error ? error.message : error}`);
      return {
        name: 'redis',
        status: 'error',
        detail: error instanceof Error ? error.message : 'unreachable',
        latencyMs: Date.now() - started,
      };
    }
  }

  private async checkJobQueue(): Promise<SystemComponentStatus> {
    const started = Date.now();
    try {
      const [counts, workers] = await Promise.all([
        withTimeout(this.queue.getJobCounts(), HTTP_TIMEOUT_MS, 'Job queue'),
        withTimeout(this.queue.getWorkers(), HTTP_TIMEOUT_MS, 'Job queue'),
      ]);
      const workerCount = workers?.length ?? 0;
      const detailParts = [
        `worker(s): ${workerCount}`,
        `waiting ${counts.waiting ?? 0}`,
        `active ${counts.active ?? 0}`,
        `delayed ${counts.delayed ?? 0}`,
        `completed ${counts.completed ?? 0}`,
        `failed ${counts.failed ?? 0}`,
      ];
      let detail = detailParts.join(' · ');
      if (workerCount === 0) {
        detail = `No worker is connected to the queue. ${detail}`;
      }
      return {
        name: 'job-queue',
        status: workerCount === 0 ? 'error' : 'ok',
        detail,
        latencyMs: Date.now() - started,
      };
    } catch (error) {
      this.logger.error(`Job queue health check failed: ${error instanceof Error ? error.message : error}`);
      return {
        name: 'job-queue',
        status: 'error',
        detail: error instanceof Error ? error.message : 'unreachable',
        latencyMs: Date.now() - started,
      };
    }
  }

  private async checkOllama(): Promise<SystemComponentStatus> {
    const started = Date.now();
    try {
      const response = await fetch(`${this.config.ollama.baseUrl}/api/tags`, {
        signal: timeoutSignal(HTTP_TIMEOUT_MS),
      });
      if (!response.ok) {
        return {
          name: 'ollama',
          status: 'error',
          detail: `Ollama returned HTTP ${response.status}.`,
          latencyMs: Date.now() - started,
        };
      }
      const payload = (await response.json()) as { models?: Array<{ name: string }> };
      const modelCount = payload.models?.length ?? 0;
      return {
        name: 'ollama',
        status: 'ok',
        detail: `Ollama reachable (HTTP 200) · ${modelCount} model(s) installed.`,
        latencyMs: Date.now() - started,
      };
    } catch (error) {
      this.logger.error(`Ollama health check failed: ${error instanceof Error ? error.message : error}`);
      return {
        name: 'ollama',
        status: 'error',
        detail: error instanceof Error ? error.message : 'Ollama is unreachable.',
        latencyMs: Date.now() - started,
      };
    }
  }
}