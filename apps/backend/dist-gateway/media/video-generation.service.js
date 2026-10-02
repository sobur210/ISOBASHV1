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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VideoGenerationService = void 0;
const entitlements_service_1 = require("../billing/entitlements.service");
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const api_error_1 = require("../shared/errors/api-error");
const inject_config_1 = require("../shared/config/inject-config");
const prisma_service_1 = require("../prisma/prisma.service");
const storage_service_1 = require("../shared/storage/storage.service");
const realtime_service_1 = require("../realtime/realtime.service");
const provider_types_1 = require("../ai/provider.types");
const ai_router_service_1 = require("../ai/ai-router.service");
const provider_credit_service_1 = require("../ai/provider-credit.service");
const video_bytes_1 = require("./video-bytes");
const queue_service_1 = require("../queues/queue.service");
const video_render_job_1 = require("./video-render-job");
/** Provider error text is stored verbatim but bounded; the API returns it as-is. */
const MAX_ERROR_CHARS = 1000;
/**
 * Phase 14 video generation.
 *
 *   PENDING -> RUNNING -> COMPLETED | FAILED | CANCELLED
 *
 * The image phase's rules hold unchanged, because they were never about images:
 *  - an asset row exists only after its bytes are on disk, and the container,
 *    frame size, duration and audio flag recorded are read from those bytes, not
 *    from the provider's claim and not from the length that was requested;
 *  - a run is COMPLETED only when a real video container was decoded out of the
 *    payload. A refusal, a quota wall and a crash are all FAILED carrying the
 *    provider's own code and message;
 *  - a clip that came back shorter than was asked for is COMPLETED *and* says so
 *    in `warning`, so a truncated render is never read as the requested one.
 *
 * Two things differ from a still, both because a clip is not a still:
 *  - `MEDIA_VIDEO_MAX_CONCURRENT` renders may be in flight at once. A video model
 *    can hold a connection open for minutes, so an unbounded queue would turn one
 *    account's requests into a stall for everybody else;
 *  - a first frame has to be read out of storage and handed to the provider,
 *    which means an image-to-video run sends those bytes to a third party. That
 *    is disclosed in the asset's note rather than done quietly.
 *
 * A run is queued the moment it is accepted and executed by a worker, so a restart
 * mid-render cannot lose it, and `MEDIA_VIDEO_MAX_CONCURRENT` now bounds the worker
 * rather than this process. The inline path below is the fallback for a deployment
 * with no Redis, and the path a run takes when no renderer can be queued for it.
 */
let VideoGenerationService = class VideoGenerationService {
    prisma;
    storage;
    ai;
    realtime;
    credits;
    queue;
    entitlements;
    config;
    log = new common_1.Logger('VideoGeneration');
    running = new Map();
    inFlight = 0;
    waiters = [];
    constructor(prisma, storage, ai, realtime, credits, queue, entitlements, config) {
        this.prisma = prisma;
        this.storage = storage;
        this.ai = ai;
        this.realtime = realtime;
        this.credits = credits;
        this.queue = queue;
        this.entitlements = entitlements;
        this.config = config;
    }
    onModuleDestroy() {
        for (const controller of this.running.values())
            controller.abort();
        this.running.clear();
        // Anything still queued will never start; release the waiters so the process
        // can exit instead of hanging on a promise nobody will ever resolve.
        while (this.waiters.length > 0)
            this.waiters.shift()?.();
    }
    async start(userId, input) {
        await this.assertQuota(userId);
        const generation = await this.prisma.videoGeneration.create({
            data: {
                prompt: input.prompt,
                aspectRatio: input.aspectRatio,
                requestedSeconds: input.durationSeconds,
                userId,
                projectId: input.projectId,
                sourceAssetId: input.sourceAssetId,
                status: 'PENDING',
            },
        });
        // Queued first, rendered by the worker, with one run always resolving to one
        // provider project. The queue is the normal path; the fallback keeps video
        // generation up when Redis is down, which is the difference between a degraded
        // deployment and a broken one.
        const data = {
            videoGenerationId: generation.id,
            userId,
            input,
            submittedAt: new Date().toISOString(),
        };
        // The renderer is chosen before the job is enqueued, because a job is only run by
        // a process that has that renderer: enqueueing a run nothing can serve would leave
        // it PENDING for ever, which reads as a render that is about to start. When no
        // renderer can take it, this process runs it inline instead, so the run fails with
        // the router's own reason rather than waiting on a worker that never comes.
        const renderer = await this.ai.resolveVideoProvider(input.model).catch((error) => {
            this.log.warn(`Could not resolve a video renderer for ${generation.id}: ${String(error)}`);
            return null;
        });
        const enqueued = renderer ? await this.enqueueRender(renderer, data).catch((error) => {
            this.log.warn(`Could not enqueue video render ${generation.id}: ${String(error)}`);
            return false;
        }) : false;
        if (!enqueued) {
            this.log.warn(`Video render ${generation.id} will run inline (no queue available).`);
            this.track(this.execute(generation.id, userId, input));
        }
        return generation;
    }
    /** Enqueue a render, refusing to queue the same run twice (`jobId` dedupes). */
    async enqueueRender(provider, data) {
        if (!this.queue.isReady())
            return false;
        await this.queue.addJob(video_render_job_1.VIDEO_RENDER_JOB, data, {
            // BullMQ forbids ":" in custom job ids (they clash with its key layout), so
            // the run's id is the dedupe key with a plain separator.
            jobId: `video-${data.videoGenerationId}`,
            attempts: 3,
            backoff: { type: 'exponential', delay: 5_000 },
            removeOnComplete: true,
            removeOnFail: 7 * 86400,
        }, (0, video_render_job_1.videoRenderQueueName)(provider));
        return true;
    }
    /** Request a cancel. The run stops at its next checkpoint and is never revived. */
    async cancel(userId, id) {
        const generation = await this.require(userId, id);
        if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(generation.status)) {
            return this.prisma.videoGeneration.findUnique({ where: { id } });
        }
        await this.prisma.videoGeneration.update({
            where: { id },
            data: { cancelRequestedAt: new Date() },
        });
        this.emit(userId, id, { status: generation.status, cancelRequested: true });
        this.running.get(id)?.abort();
        return this.prisma.videoGeneration.findUnique({ where: { id } });
    }
    track(promise) {
        promise.catch((error) => {
            this.log.error(`Video generation crashed: ${error instanceof Error ? error.message : String(error)}`);
        });
    }
    /**
     * Run one render to its terminal state.
     *
     * Runnable from the request process (inline fallback) and the worker (the normal
     * path), and idempotent against a retry: a run that already ended returns without
     * touching anything, and a run whose provider project already exists resumes it
     * instead of creating a second one.
     */
    async execute(generationId, userId, input) {
        const controller = new AbortController();
        this.running.set(generationId, controller);
        try {
            const existing = await this.prisma.videoGeneration.findUnique({
                where: { id: generationId },
                select: { status: true, providerProjectId: true },
            });
            if (existing && ['COMPLETED', 'FAILED', 'CANCELLED'].includes(existing.status)) {
                this.log.warn(`Video render ${generationId} is already ${existing.status}; the retry does nothing.`);
                return;
            }
            // A queued job retried after a worker restart must not create a fresh provider
            // project for a render one already exists for: on a metered pool that is paying
            // twice for one clip. Read once here so the whole run below shares the decision.
            const resumedJobId = existing?.providerProjectId ?? undefined;
            if (resumedJobId) {
                this.log.log(`Resuming provider project ${resumedJobId} for ${generationId} rather than starting a new render.`);
            }
            if (await this.isCancelled(generationId)) {
                await this.finishCancelled(generationId, userId);
                return;
            }
            await this.prisma.videoGeneration.update({
                where: { id: generationId },
                data: { status: 'RUNNING', startedAt: new Date() },
            });
            this.emit(userId, generationId, { status: 'RUNNING' });
            // The first frame is read before the provider is called so a missing or
            // corrupt asset fails the run with a real reason instead of after a render.
            let image;
            if (input.sourceAssetId) {
                image = await this.loadSourceImage(userId, input.sourceAssetId);
            }
            if (await this.isCancelled(generationId)) {
                await this.finishCancelled(generationId, userId);
                return;
            }
            let response;
            let reservation = null;
            try {
                await this.acquireSlot();
                // Phase 15: priced and reserved against the shared provider pool *before*
                // anything is submitted. A render that cannot be paid for fails here, with
                // the reason, rather than after a multi-minute wait for a provider refusal.
                reservation = await this.credits.reserveIfAffordable({
                    provider: 'magic-hour',
                    videoGenerationId: generationId,
                    userId,
                    model: input.model,
                    seconds: input.durationSeconds,
                    withAudio: input.withAudio,
                });
                response = await this.ai.generateVideo({
                    capability: 'video-generation',
                    prompt: input.prompt,
                    ...(input.aspectRatio ? { aspectRatio: input.aspectRatio } : {}),
                    durationSeconds: input.durationSeconds,
                    ...(input.model ? { model: input.model } : {}),
                    ...(image ? { image } : {}),
                    withAudio: input.withAudio,
                    // Cancellation is honoured mid-render rather than only between runs, which
                    // matters when a single render holds the user for minutes.
                    signal: controller.signal,
                    // A retried job resumes the render the provider already has instead of
                    // paying to create a second one for the same clip.
                    ...(resumedJobId ? { providerJobId: resumedJobId } : {}),
                    onJobProgress: (update) => {
                        this.recordProgress(generationId, userId, update);
                    },
                });
            }
            catch (error) {
                const providerError = error instanceof provider_types_1.AiProviderError
                    ? error
                    : new provider_types_1.AiProviderError(error instanceof Error ? error.message : 'Video generation failed.', 'router', 'PROVIDER_UNAVAILABLE');
                await this.fail(generationId, userId, providerError.code, providerError.message);
                // Only runs that reserved credits have a ledger row to settle. A refusal by
                // the pool guard happens before the reservation, so there is nothing to write
                // and nothing was spent.
                if (reservation) {
                    // The provider's own project id, when the failure happened after Magic Hour
                    // accepted the render. Without it a failed render is indistinguishable from
                    // one refused before submission, and the ledger would have to guess whether
                    // credits were actually spent.
                    const projectId = providerError.providerProjectId;
                    await this.credits
                        .settleRun({
                        videoGenerationId: generationId,
                        succeeded: false,
                        metering: projectId
                            ? { providerProjectId: projectId, creditsCharged: null, creditsChargedIsEstimate: true }
                            : null,
                        error: providerError.message,
                    })
                        .catch((settleError) => {
                        this.log.error(`Could not settle credits for ${generationId}: ${String(settleError)}`);
                    });
                }
                this.log.warn(`Video generation ${generationId} FAILED (${providerError.code}): ${providerError.message}`);
                return;
            }
            finally {
                this.releaseSlot();
            }
            if (await this.isCancelled(generationId)) {
                await this.finishCancelled(generationId, userId);
                return;
            }
            if (!response.video.data) {
                const reason = response.finishReason ?? 'UNKNOWN';
                await this.fail(generationId, userId, 'PROVIDER_REFUSED', (0, provider_types_1.isProviderRefusal)(response.finishReason)
                    ? `${response.provider} declined to render this clip. Its own finish reason was ${reason}. This is the provider's verdict, not a filter ISOBASH ran.`
                    : `${response.provider} returned no video data. Finish reason: ${reason}.`, reason, { provider: response.provider, model: response.model });
                return;
            }
            let assetId;
            let durationMs;
            try {
                const stored = await this.store(generationId, userId, input, response);
                assetId = stored.id;
                durationMs = stored.durationMs;
            }
            catch (error) {
                await this.fail(generationId, userId, 'EMPTY_PROVIDER_RESPONSE', `${response.provider} answered with ${response.video.mimeType} but the bytes are not a video this can store. ${error instanceof Error ? error.message : 'The container could not be read.'}`.trim(), response.finishReason, { provider: response.provider, model: response.model });
                return;
            }
            // A short render is a success with a caveat, not a silent downgrade: the
            // caller asked for N seconds and the header says fewer were produced.
            const notes = [];
            if (durationMs !== null && durationMs + 500 < input.durationSeconds * 1000) {
                notes.push(`The render is ${(durationMs / 1000).toFixed(2)}s, shorter than the ${input.durationSeconds}s requested.`);
            }
            if (response.failovers && response.failovers.length > 0)
                notes.push(...response.failovers);
            const warning = notes.length > 0 ? notes.join(' ').slice(0, MAX_ERROR_CHARS) : null;
            await this.prisma.videoGeneration.update({
                where: { id: generationId },
                data: {
                    status: 'COMPLETED',
                    error: null,
                    errorCode: null,
                    warning,
                    provider: response.provider,
                    model: response.model,
                    finishReason: response.finishReason ?? null,
                    inputTokens: response.usage?.inputTokens,
                    outputTokens: response.usage?.outputTokens,
                    finishedAt: new Date(),
                },
            });
            this.emit(userId, generationId, { status: 'COMPLETED', assetId, warning });
            // Settled last, and only once the clip is on disk, so the ledger records a
            // charge for a render ISOBASH can actually show the user.
            if (reservation) {
                // The reservation was taken against Magic Hour, so only Magic Hour can settle
                // it. A render that failed over to another renderer never spent a single one of
                // those credits, and recording the fallback's free clip as a paid render would
                // overstate the month's spend and understate what is left.
                if (response.provider === 'magic-hour') {
                    await this.credits
                        .settleRun({ videoGenerationId: generationId, succeeded: true, metering: response.metering ?? null })
                        .catch((settleError) => {
                        this.log.error(`Could not settle credits for ${generationId}: ${String(settleError)}`);
                    });
                }
                else {
                    await this.credits
                        .release(generationId, `${response.provider} rendered this instead of Magic Hour, so no Magic Hour credits were spent.`)
                        .catch((settleError) => {
                        this.log.error(`Could not release credits for ${generationId}: ${String(settleError)}`);
                    });
                }
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Video generation failed.';
            await this.fail(generationId, userId, 'GENERATION_FAILED', message);
            this.log.error(`Video generation ${generationId} crashed: ${message}`);
        }
        finally {
            this.running.delete(generationId);
        }
    }
    /**
     * Write the bytes first, then describe them. A row that claims a clip which is
     * not on disk would be a lie the player would happily render as broken.
     */
    async store(generationId, userId, input, response) {
        const bytes = Buffer.from(response.video.data, 'base64');
        if (bytes.byteLength === 0) {
            throw new Error('the provider returned an empty video payload.');
        }
        if (bytes.byteLength > this.config.media.video.maxVideoBytes) {
            throw new Error(`it is ${bytes.byteLength} bytes, over the ${this.config.media.video.maxVideoBytes} byte ceiling.`);
        }
        const sniffed = (0, video_bytes_1.sniffVideo)(bytes);
        if (!sniffed) {
            throw new Error(`its bytes are not an MP4, MOV or WebM video with a video track, so nothing claimed they were (provider said ${response.video.mimeType}).`);
        }
        const relativePath = this.relativePathFor(userId, sniffed.extension);
        await this.storage.write('media', relativePath, bytes);
        const asset = await this.prisma.mediaAsset.create({
            data: {
                kind: 'VIDEO',
                relativePath,
                mimeType: sniffed.mimeType,
                sizeBytes: bytes.byteLength,
                width: sniffed.width,
                height: sniffed.height,
                durationMs: sniffed.durationMs,
                hasAudio: sniffed.hasAudio,
                sha256: (0, node_crypto_1.createHash)('sha256').update(bytes).digest('hex'),
                note: response.video.note ?? null,
                prompt: input.prompt,
                aspectRatio: input.aspectRatio,
                provider: response.provider,
                model: response.model,
                userId,
                projectId: input.projectId,
                videoGenerationId: generationId,
            },
        });
        this.emit(userId, generationId, { status: 'RUNNING', assetId: asset.id });
        return { id: asset.id, durationMs: sniffed.durationMs };
    }
    /**
     * Read a stored image back out to hand to the provider as the first frame. The
     * asset has to be this account's and has to be an image: an id that names
     * someone else's clip is not a first frame.
     */
    async loadSourceImage(userId, assetId) {
        const asset = await this.prisma.mediaAsset.findFirst({
            where: { id: assetId, userId, kind: 'IMAGE' },
            select: { relativePath: true, mimeType: true, sha256: true },
        });
        if (!asset) {
            throw new api_error_1.ApiError('The first-frame image was not found in your media library.', 400, 'VALIDATION_FAILED');
        }
        const bytes = await this.storage.read('media', asset.relativePath);
        if ((0, node_crypto_1.createHash)('sha256').update(bytes).digest('hex') !== asset.sha256) {
            throw new api_error_1.ApiError('The first-frame image no longer matches its recorded checksum, so it cannot be used. Delete it and pick another.', 400, 'ASSET_CORRUPT');
        }
        return { mimeType: asset.mimeType, data: bytes.toString('base64') };
    }
    /** A server-generated path; nothing a provider or caller supplied reaches the disk. */
    relativePathFor(userId, extension) {
        const now = new Date();
        const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
        return `user-${userId}/${month}/${(0, node_crypto_1.randomUUID)()}.${extension.replace(/[^a-z0-9]/gi, '').toLowerCase()}`;
    }
    async isCancelled(generationId) {
        if (this.running.get(generationId)?.signal.aborted)
            return true;
        const row = await this.prisma.videoGeneration.findUnique({
            where: { id: generationId },
            select: { cancelRequestedAt: true },
        });
        return row?.cancelRequestedAt != null;
    }
    /**
     * Record the provider's own view of a render as it changes.
     *
     * Two things are stored here and they are not the same thing. The provider's
     * project id is written the first time it is seen and never overwritten, because it
     * is what lets a retried job resume rather than pay for a second render. The
     * percentage is written only when the provider actually reports one, so a provider
     * that reports no progress leaves the column null instead of ISOBASH inventing a
     * number it cannot know.
     *
     * Fire-and-forget by design: this runs on the provider's poll callback, and a slow
     * or failed write must not be able to slow down or fail the render it describes.
     */
    recordProgress(generationId, userId, update) {
        this.prisma.videoGeneration
            .updateMany({
            where: { id: generationId, providerProjectId: null },
            data: { providerProjectId: update.id },
        })
            .catch((error) => {
            this.log.error(`Could not record provider project for ${generationId}: ${String(error)}`);
        });
        if (update.progressPercent === null)
            return;
        this.prisma.videoGeneration
            .updateMany({ where: { id: generationId }, data: { progressPercent: update.progressPercent } })
            .catch((error) => {
            this.log.error(`Could not record progress for ${generationId}: ${String(error)}`);
        });
        this.emit(userId, generationId, { status: 'RUNNING', progress: update.progressPercent });
    }
    async finishCancelled(generationId, userId) {
        await this.prisma.videoGeneration.update({
            where: { id: generationId },
            data: { status: 'CANCELLED', error: null, errorCode: null, finishedAt: new Date() },
        });
        this.emit(userId, generationId, { status: 'CANCELLED' });
    }
    async fail(generationId, userId, code, message, finishReason, provider) {
        await this.prisma.videoGeneration.update({
            where: { id: generationId },
            data: {
                status: 'FAILED',
                error: message.slice(0, MAX_ERROR_CHARS),
                errorCode: code,
                warning: null,
                finishReason: finishReason ?? null,
                ...(provider ?? {}),
                finishedAt: new Date(),
            },
        });
        this.emit(userId, generationId, { status: 'FAILED', code, error: message });
    }
    /**
     * Bound how many video renders this process will have open at once. A clip can
     * hold a provider connection open for minutes; without a ceiling a handful of
     * requests would starve every other feature sharing the event loop.
     */
    acquireSlot() {
        if (this.inFlight < this.config.media.video.maxConcurrent) {
            this.inFlight += 1;
            return Promise.resolve();
        }
        return new Promise((resolve) => {
            this.waiters.push(() => {
                this.inFlight += 1;
                resolve();
            });
        });
    }
    releaseSlot() {
        if (this.inFlight > 0)
            this.inFlight -= 1;
        this.waiters.shift()?.();
    }
    async assertQuota(userId) {
        const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const [recent, assets, aggregate] = await Promise.all([
            this.prisma.videoGeneration.count({ where: { userId, createdAt: { gte: hourAgo } } }),
            this.prisma.mediaAsset.count({ where: { userId } }),
            this.prisma.mediaAsset.aggregate({ where: { userId }, _sum: { sizeBytes: true } }),
        ]);
        if (recent >= this.config.media.video.generationsPerHour) {
            throw new api_error_1.ApiError(`This account started ${recent} video generation(s) in the last hour (limit ${this.config.media.video.generationsPerHour}). A render takes minutes, not seconds, so try again later.`, 429, 'RATE_LIMITED');
        }
        // Phase 16: the quota is this account's entitlement (plan limit clamped to the
        // deployment ceiling), so a plan change takes effect on the next request.
        const entitlements = await this.entitlements.forUser(userId);
        const maxAssets = entitlements.limits.mediaAssets.value;
        const maxBytes = entitlements.limits.mediaBytes.value;
        if (assets >= maxAssets) {
            throw new api_error_1.ApiError(`This account already stores ${assets} media file(s) (limit ${maxAssets} on the ${entitlements.plan} plan). Delete one before rendering another clip.`, 413, 'MEDIA_QUOTA_EXCEEDED');
        }
        const used = aggregate._sum.sizeBytes ?? 0;
        if (used >= maxBytes) {
            throw new api_error_1.ApiError(`This account stores ${used} bytes of media, at the ${maxBytes} byte quota on the ${entitlements.plan} plan.`, 413, 'MEDIA_QUOTA_EXCEEDED');
        }
    }
    async require(userId, id) {
        const generation = await this.prisma.videoGeneration.findFirst({ where: { id, userId } });
        if (!generation) {
            throw new common_1.NotFoundException('Video generation not found.');
        }
        return generation;
    }
    emit(userId, generationId, payload) {
        this.realtime.emitToUser(userId, 'video:generation', { generationId, ...payload });
    }
};
exports.VideoGenerationService = VideoGenerationService;
exports.VideoGenerationService = VideoGenerationService = __decorate([
    (0, common_1.Injectable)(),
    __param(7, (0, inject_config_1.InjectConfig)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        storage_service_1.StorageService,
        ai_router_service_1.AiRouterService,
        realtime_service_1.RealtimeService,
        provider_credit_service_1.ProviderCreditService,
        queue_service_1.QueueService,
        entitlements_service_1.EntitlementsService, Object])
], VideoGenerationService);
//# sourceMappingURL=video-generation.service.js.map