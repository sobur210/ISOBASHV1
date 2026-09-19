import { config } from 'dotenv';
import { Job, Worker } from 'bullmq';
import Redis from 'ioredis';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../../../.env') });

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

const worker = new Worker(
  'isobash-queue',
  async (job: Job) => {
    console.log(`[worker] processing ${job.name}`);
    return { processed: true, job: job.name, data: job.data };
  },
  { connection },
);

worker.on('completed', (job) => console.log(`[worker] completed ${job.id}`));
worker.on('failed', (job, error) => console.error(`[worker] failed ${job?.id}: ${error.message}`));

async function shutdown() {
  await worker.close();
  await connection.quit();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
