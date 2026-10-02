import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AiModelRegistry } from '../ai/model.registry';
import { AiProviderRegistry } from '../ai/provider.registry';
import { QueueService } from '../queues/queue.service';
import { VideoGenerationService } from './video-generation.service';
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
export declare class VideoRenderQueue implements OnModuleInit, OnModuleDestroy {
    private readonly queue;
    private readonly videoGeneration;
    private readonly providers;
    private readonly models;
    private readonly log;
    private cleanups;
    constructor(queue: QueueService, videoGeneration: VideoGenerationService, providers: AiProviderRegistry, models: AiModelRegistry);
    onModuleInit(): void;
    /**
     * The providers this process can actually render with.
     *
     * Taken from the same two registries the router plans from, so a provider is
     * either servable here and routable here, or neither. A model-level check is
     * preferred over the provider's own capability list for the reason the router
     * documents: a provider that advertises several capabilities does not lend all of
     * them to every one of its models.
     */
    private renderersHere;
    private process;
    onModuleDestroy(): Promise<void>;
}
