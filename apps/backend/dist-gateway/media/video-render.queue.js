"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VideoRenderQueue = void 0;
const common_1 = require("@nestjs/common");
const model_registry_1 = require("../ai/model.registry");
const provider_registry_1 = require("../ai/provider.registry");
const queue_service_1 = require("../queues/queue.service");
const video_generation_service_1 = require("./video-generation.service");
const video_render_job_1 = require("./video-render-job");
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
let VideoRenderQueue = class VideoRenderQueue {
    queue;
    videoGeneration;
    providers;
    models;
    log = new common_1.Logger('VideoRenderQueue');
    cleanups = [];
    constructor(queue, videoGeneration, providers, models) {
        this.queue = queue;
        this.videoGeneration = videoGeneration;
        this.providers = providers;
        this.models = models;
    }
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
            const name = (0, video_render_job_1.videoRenderQueueName)(provider);
            const worker = this.queue.createWorker(name, (job) => this.process(job), { concurrency });
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
    renderersHere() {
        const names = this.providers.names().filter((name) => {
            const instance = this.providers.instance(name);
            if (!instance?.generateVideo)
                return false;
            const models = this.models.modelsFor(name);
            return models.length === 0
                ? instance.capabilities.includes('video-generation')
                : models.some((model) => model.capabilities.includes('video-generation'));
        });
        return names.sort();
    }
    async process(job) {
        const { videoGenerationId, userId, input } = job.data;
        this.log.log(`Processing ${video_render_job_1.VIDEO_RENDER_JOB} ${videoGenerationId} (attempt ${job.attemptsMade + 1}).`);
        await this.videoGeneration.execute(videoGenerationId, userId, input);
    }
    async onModuleDestroy() {
        await Promise.allSettled(this.cleanups.map((cleanup) => cleanup()));
    }
};
exports.VideoRenderQueue = VideoRenderQueue;
exports.VideoRenderQueue = VideoRenderQueue = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [queue_service_1.QueueService,
        video_generation_service_1.VideoGenerationService,
        provider_registry_1.AiProviderRegistry,
        model_registry_1.AiModelRegistry])
], VideoRenderQueue);
function positiveIntOrDefault(value, fallback) {
    const parsed = Number(value ?? '');
    return Number.isInteger(parsed) && parsed >= 1 ? parsed : fallback;
}
//# sourceMappingURL=video-render.queue.js.map