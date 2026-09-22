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

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Queue');
  private readonly connection: Redis;
  private readonly queue: Queue;

  constructor(@InjectConfig() config: AppConfig) {
    this.connection = new Redis(config.redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    });
    this.queue = new Queue('isobash-queue', {
      connection: this.connection,
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });
  }

  async onModuleInit() {
    await this.connection.ping();
    this.logger.log('Redis connection ready');
  }

  getQueue(): Queue {
    return this.queue;
  }

  async addJob(name: string, data: unknown, options?: JobsOptions) {
    return this.queue.add(name, data, options);
  }

  async ping(): Promise<string> {
    return this.connection.ping();
  }

  async getJobCounts() {
    return this.queue.getJobCounts();
  }

  async getWorkers() {
    return this.queue.getWorkers();
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