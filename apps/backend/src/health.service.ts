import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { QueueService } from './queues/queue.service';

export type ComponentStatus = {
  name: string;
  status: 'ok' | 'error';
  detail?: string;
};

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
      await this.prisma.$queryRaw`SELECT 1`;
      return { name: 'database', status: 'ok' };
    } catch (error) {
      this.logger.error(`Database health check failed: ${error instanceof Error ? error.message : error}`);
      return { name: 'database', status: 'error', detail: error instanceof Error ? error.message : 'unreachable' };
    }
  }

  private async checkRedis(): Promise<ComponentStatus> {
    try {
      const pong = await this.queue.ping();
      return pong === 'PONG' ? { name: 'redis', status: 'ok' } : { name: 'redis', status: 'error', detail: 'unexpected response' };
    } catch (error) {
      this.logger.error(`Redis health check failed: ${error instanceof Error ? error.message : error}`);
      return { name: 'redis', status: 'error', detail: error instanceof Error ? error.message : 'unreachable' };
    }
  }
}