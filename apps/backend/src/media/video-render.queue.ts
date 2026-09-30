import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Job } from 'bullmq';
import { AiModelRegistry } from '../ai/model.registry';
import { AiProviderRegistry } from '../ai/provider.registry';
import { QueueService } from '../queues/queue.service';
import { VideoGenerationService } from './video-generation.service';
import { VIDEO_RENDER_JOB, VideoRenderJobData, videoRenderQueueName } from './video-render-job';

/**
 * The BullMQ worker for video generation.
 *
 * `startVideo` no longer needs to wait in the request process: the run is enqueued
 * the moment the request is accepted, and a worker here picks it up. The job is
 * durable:
 *
 *   - it survives a process restart, because the run's fate lives in Redis and the
 *     provider's project id is persisted to Postgres the moment it exists;
 *   - it is never enqueued twice for one run (`jobId` dedupes), so a retried HTTP
 *     request cannot pay for two renders;
 *   - a retried job resumes the provider project that already exists rather than
 *     creating a second one, via `providerJobId`.
 *
 * A render is resolved to at most one provider project, which is the whole point of
 * metering it: on a shared pool, "did the request time out twice" must not cost two
 * renders.
 *
 * One worker per renderer, and only for the renderers this process has registered.
 * A process that cannot reach Magic Hour must not take a Magic Hour job and fail
 * it: whether a user's render works would otherwise depend on which replica won
 * the race for it. See `video-render-job.ts` for why this is not the shared queue.
 */
@Injectable()
export class VideoRenderQueue implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('VideoRenderQueue');
  private cleanups: (() => Promise<void>)[] = [];

  constructor(
    private readonly queue: QueueService,
    private readonly videoGeneration: VideoGenerationService,
    private readonly providers: AiProviderRegistry,
    private readonly models: AiModelRegistry,
  ) {}

  onModuleInit() {
    // One render in flight per app, which is what MEDIA_VIDEO_MAX_CONCURRENT was
    // protecting when the service held its own in-process queue.
    const concurrency = positiveIntOrDefault(process.env.MEDIA_VIDEO_MAX_CONCURRENT, 1);
    const renderers = this.renderersHere();
    if (renderers.length === 0) {
      this.log.log('No video renderer is registered in this process, so no render worker was started.');
      return;
    }
    for (const provider of renderers) {
      const name = videoRenderQueueName(provider);
      const worker = this.queue.createWorker(
        name,
        (job) => this.process(job as unknown as Job<VideoRenderJobData>),
        { concurrency },
      );
      if (!worker) {
        this.log.warn(`No worker started for ${name}; renders through ${provider} will not be processed until Redis is reachable.`);
        continue;
      }
      this.cleanups.push(() => worker.close());
      this.log.log(`Video render worker started for ${name} (concurrency ${concurrency}).`);
    }
  }

  /**
   * The providers this process can actually render with.
   *
   * Taken from the same two registries the router plans from, so a provider is
   * either servable here and routable here, or neither. A model-level check is
   * preferred over the provider's own capability list for the reason the router
   * documents: a provider that advertises several capabilities does not lend all of
   * them to every one of its models.
   */
  private renderersHere(): string[] {
    const names = this.providers.names().filter((name) => {
      const instance = this.providers.instance(name);
      if (!instance?.generateVideo) return false;
      const models = this.models.modelsFor(name);
      return models.length === 0
        ? instance.capabilities.includes('video-generation')
        : models.some((model) => model.capabilities.includes('video-generation'));
    });
    return names.sort();
  }

  private async process(job: Job<VideoRenderJobData>) {
    const { videoGenerationId, userId, input } = job.data;
    this.log.log(`Processing ${VIDEO_RENDER_JOB} ${videoGenerationId} (attempt ${job.attemptsMade + 1}).`);
    await this.videoGeneration.execute(videoGenerationId, userId, input);
  }

  async onModuleDestroy() {
    await Promise.allSettled(this.cleanups.map((cleanup) => cleanup()));
  }
}

function positiveIntOrDefault(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? '');
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : fallback;
}