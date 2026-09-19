import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import Redis from 'ioredis';

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  });
  private readonly queue = new Queue('isobash-queue', { connection: this.connection });

  async addJob(name: string, data: unknown) {
    await this.queue.add(name, data);
  }

  async onModuleDestroy() {
    await this.queue.close();
    await this.connection.quit();
  }
}
