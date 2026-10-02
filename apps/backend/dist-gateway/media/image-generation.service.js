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
exports.ImageGenerationService = void 0;
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
const prompt_composer_service_1 = require("./prompt-composer.service");
const media_images_1 = require("./media-images");
/** Provider error text is stored verbatim but bounded; the API returns it as-is. */
const MAX_ERROR_CHARS = 1000;
/**
 * Phase 13 image generation.
 *
 *   PENDING -> RUNNING -> COMPLETED | FAILED | CANCELLED
 *
 * The state is written as it happens so a client polling the run sees real
 * progress. Three rules hold throughout:
 *  - an asset row is only created after its bytes are on disk, and the type and
 *    dimensions recorded are read from those bytes, not from the provider's claim;
 *  - a run is COMPLETED only when at least one image was really produced. A
 *    provider refusal (its own `IMAGE_SAFETY` verdict), a quota refusal and a
 *    genuine failure are all recorded as FAILED with the provider's code, never
 *    as an empty success;
 *  - a run that produced fewer images than were asked for is COMPLETED *and* says
 *    so in `warning`, so a partial result is never read as a full one.
 *
 * Runs execute in this process. Moving them onto the BullMQ worker is Phase 15,
 * and is the reason `cancel` is honoured at checkpoints rather than by aborting a
 * provider call that is already in flight.
 */
let ImageGenerationService = class ImageGenerationService {
    prisma;
    storage;
    ai;
    realtime;
    composer;
    entitlements;
    config;
    log = new common_1.Logger('ImageGeneration');
    running = new Map();
    constructor(prisma, storage, ai, realtime, composer, entitlements, config) {
        this.prisma = prisma;
        this.storage = storage;
        this.ai = ai;
        this.realtime = realtime;
        this.composer = composer;
        this.entitlements = entitlements;
        this.config = config;
    }
    onModuleDestroy() {
        for (const controller of this.running.values())
            controller.abort();
        this.running.clear();
    }
    async start(userId, input) {
        await this.assertQuota(userId, input.count);
        const generation = await this.prisma.imageGeneration.create({
            data: {
                prompt: input.prompt,
                style: input.style,
                aspectRatio: input.aspectRatio,
                requestedCount: input.count,
                userId,
                projectId: input.projectId,
                status: 'PENDING',
            },
        });
        this.track(this.execute(generation.id, userId, input));
        return generation;
    }
    /** Request a cancel. The run stops at its next checkpoint and is never revived. */
    async cancel(userId, id) {
        const generation = await this.require(userId, id);
        if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(generation.status)) {
            return this.prisma.imageGeneration.findUnique({ where: { id } });
        }
        await this.prisma.imageGeneration.update({
            where: { id },
            data: { cancelRequestedAt: new Date() },
        });
        this.emit(userId, id, { status: generation.status, cancelRequested: true });
        this.running.get(id)?.abort();
        return this.prisma.imageGeneration.findUnique({ where: { id } });
    }
    track(promise) {
        promise.catch((error) => {
            this.log.error(`Image generation crashed: ${error instanceof Error ? error.message : String(error)}`);
        });
    }
    async execute(generationId, userId, input) {
        const controller = new AbortController();
        this.running.set(generationId, controller);
        try {
            if (await this.isCancelled(generationId)) {
                await this.finishCancelled(generationId, userId);
                return;
            }
            await this.prisma.imageGeneration.update({
                where: { id: generationId },
                data: { status: 'RUNNING', startedAt: new Date() },
            });
            this.emit(userId, generationId, { status: 'RUNNING' });
            /**
             * Compose the text before the render, and write down what was composed. The
             * caller's words stay in `prompt`; `enhancedPrompt` records the exact string
             * handed to the renderer, and `style` the preset that shaped it. A rewrite
             * that failed is reported in `warning` rather than hidden, so a run whose
             * prompt reads differently from the box is explained by the run itself.
             */
            const composed = await this.composer.compose({
                prompt: input.prompt,
                style: input.style,
                enhance: input.enhance,
            });
            if (composed.enhanced !== null) {
                await this.prisma.imageGeneration.update({
                    where: { id: generationId },
                    data: { enhancedPrompt: composed.enhanced },
                });
            }
            const renderPrompt = composed.enhanced ?? composed.original;
            // Only a *failed* rewrite is worth surfacing. A clean run that simply
            // appended a style preset is not a warning, and neither is a run where
            // enhancement was off.
            const composeWarning = composed.enhancerNote;
            let response;
            try {
                response = await this.ai.generateImage({
                    capability: 'image-generation',
                    prompt: renderPrompt,
                    ...(input.aspectRatio ? { aspectRatio: input.aspectRatio } : {}),
                    count: input.count,
                    ...(input.model ? { model: input.model } : {}),
                });
            }
            catch (error) {
                const providerError = error instanceof provider_types_1.AiProviderError
                    ? error
                    : new provider_types_1.AiProviderError(error instanceof Error ? error.message : 'Image generation failed.', 'router', 'PROVIDER_UNAVAILABLE');
                await this.fail(generationId, userId, providerError.code, providerError.message);
                this.log.warn(`Image generation ${generationId} FAILED (${providerError.code}): ${providerError.message}`);
                return;
            }
            if (await this.isCancelled(generationId)) {
                await this.finishCancelled(generationId, userId);
                return;
            }
            if (response.images.length === 0) {
                const reason = response.finishReason ?? 'UNKNOWN';
                await this.fail(generationId, userId, 'PROVIDER_REFUSED', (0, provider_types_1.isProviderRefusal)(response.finishReason)
                    ? `${response.provider} declined to generate this image. Its own finish reason was ${reason}. This is the provider's verdict, not a filter ISOBASH ran.`
                    : `${response.provider} returned no image data. Finish reason: ${reason}.`, reason, { provider: response.provider, model: response.model });
                return;
            }
            const stored = [];
            const skipped = [];
            for (const [index, image] of response.images.entries()) {
                if (await this.isCancelled(generationId)) {
                    await this.finishCancelled(generationId, userId);
                    return;
                }
                try {
                    stored.push(await this.store(generationId, userId, input, image, composed.enhanced));
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : 'An image could not be stored.';
                    skipped.push(`image ${index + 1}: ${message}`);
                    this.log.warn(`Image ${index + 1} of generation ${generationId} was not stored: ${message}`);
                }
            }
            if (stored.length === 0) {
                await this.fail(generationId, userId, 'EMPTY_PROVIDER_RESPONSE', `${response.provider} returned ${response.images.length} image(s) but none could be stored. ${skipped.join(' ')}`.trim(), response.finishReason, { provider: response.provider, model: response.model });
                return;
            }
            const providerFailures = (response.failures ?? []).map((failure) => `${failure.code}: ${failure.message}`);
            const shortfall = [];
            if (composeWarning)
                shortfall.push(composeWarning);
            // A renderer that was skipped is reported on the run, so an image produced
            // by a second provider is never passed off as the one that was picked.
            if (response.failovers && response.failovers.length > 0)
                shortfall.push(...response.failovers);
            if (skipped.length > 0)
                shortfall.push(...skipped);
            if (providerFailures.length > 0)
                shortfall.push(...providerFailures);
            const warning = shortfall.length > 0
                ? `${stored.length} of ${response.requested} requested image(s) were stored. ${shortfall.join(' ')}`.slice(0, MAX_ERROR_CHARS)
                : null;
            await this.prisma.imageGeneration.update({
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
            this.emit(userId, generationId, { status: 'COMPLETED', assets: stored.length, warning });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Image generation failed.';
            await this.fail(generationId, userId, 'GENERATION_FAILED', message);
            this.log.error(`Image generation ${generationId} crashed: ${message}`);
        }
        finally {
            this.running.delete(generationId);
        }
    }
    /**
     * Write the bytes first, then describe them. A row that claims an image which
     * is not on disk would be a lie the gallery would happily render.
     */
    async store(generationId, userId, input, image, enhancedPrompt) {
        const bytes = Buffer.from(image.data, 'base64');
        if (bytes.byteLength === 0) {
            throw new Error('the provider returned an empty image payload.');
        }
        if (bytes.byteLength > this.config.media.maxImageBytes) {
            throw new Error(`it is ${bytes.byteLength} bytes, over the ${this.config.media.maxImageBytes} byte ceiling.`);
        }
        const sniffed = (0, media_images_1.sniffImage)(bytes);
        if (!sniffed) {
            throw new Error(`its bytes are not a PNG, JPEG, GIF or WebP image, so nothing claimed they were (provider said ${image.mimeType}).`);
        }
        const relativePath = this.relativePathFor(userId, sniffed.extension);
        await this.storage.write('media', relativePath, bytes);
        const asset = await this.prisma.mediaAsset.create({
            data: {
                kind: 'IMAGE',
                relativePath,
                mimeType: sniffed.mimeType,
                sizeBytes: bytes.byteLength,
                width: sniffed.width,
                height: sniffed.height,
                sha256: (0, node_crypto_1.createHash)('sha256').update(bytes).digest('hex'),
                note: image.note ?? null,
                prompt: input.prompt,
                enhancedPrompt,
                style: input.style,
                aspectRatio: input.aspectRatio,
                userId,
                projectId: input.projectId,
                generationId,
            },
        });
        this.emit(userId, generationId, { status: 'RUNNING', assetId: asset.id });
        return asset.id;
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
        const row = await this.prisma.imageGeneration.findUnique({
            where: { id: generationId },
            select: { cancelRequestedAt: true },
        });
        return row?.cancelRequestedAt != null;
    }
    async finishCancelled(generationId, userId) {
        await this.prisma.imageGeneration.update({
            where: { id: generationId },
            data: { status: 'CANCELLED', error: null, errorCode: null, finishedAt: new Date() },
        });
        this.emit(userId, generationId, { status: 'CANCELLED' });
    }
    async fail(generationId, userId, code, message, finishReason, provider) {
        await this.prisma.imageGeneration.update({
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
    async assertQuota(userId, count) {
        if (count > this.config.media.maxImagesPerRequest) {
            throw new api_error_1.ApiError(`A single generation is limited to ${this.config.media.maxImagesPerRequest} image(s), got ${count}.`, 400, 'VALIDATION_FAILED');
        }
        const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const [recent, assets, aggregate] = await Promise.all([
            this.prisma.imageGeneration.count({ where: { userId, createdAt: { gte: hourAgo } } }),
            this.prisma.mediaAsset.count({ where: { userId } }),
            this.prisma.mediaAsset.aggregate({ where: { userId }, _sum: { sizeBytes: true } }),
        ]);
        if (recent >= this.config.media.generationsPerHour) {
            throw new api_error_1.ApiError(`This account started ${recent} generation(s) in the last hour (limit ${this.config.media.generationsPerHour}). Try again later.`, 429, 'RATE_LIMITED');
        }
        // Phase 16: the quota is this account's entitlement (plan limit clamped to the
        // deployment ceiling), so a plan change takes effect on the next request.
        const entitlements = await this.entitlements.forUser(userId);
        const maxAssets = entitlements.limits.mediaAssets.value;
        const maxBytes = entitlements.limits.mediaBytes.value;
        if (assets >= maxAssets) {
            throw new api_error_1.ApiError(`This account already stores ${assets} media file(s) (limit ${maxAssets} on the ${entitlements.plan} plan). Delete one before generating another.`, 413, 'MEDIA_QUOTA_EXCEEDED');
        }
        const used = aggregate._sum.sizeBytes ?? 0;
        if (used >= maxBytes) {
            throw new api_error_1.ApiError(`This account stores ${used} bytes of media, at the ${maxBytes} byte quota on the ${entitlements.plan} plan.`, 413, 'MEDIA_QUOTA_EXCEEDED');
        }
    }
    async require(userId, id) {
        const generation = await this.prisma.imageGeneration.findFirst({ where: { id, userId } });
        if (!generation) {
            throw new common_1.NotFoundException('Image generation not found.');
        }
        return generation;
    }
    emit(userId, generationId, payload) {
        this.realtime.emitToUser(userId, 'media:generation', { generationId, ...payload });
    }
};
exports.ImageGenerationService = ImageGenerationService;
exports.ImageGenerationService = ImageGenerationService = __decorate([
    (0, common_1.Injectable)(),
    __param(6, (0, inject_config_1.InjectConfig)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        storage_service_1.StorageService,
        ai_router_service_1.AiRouterService,
        realtime_service_1.RealtimeService,
        prompt_composer_service_1.PromptComposerService,
        entitlements_service_1.EntitlementsService, Object])
], ImageGenerationService);
//# sourceMappingURL=image-generation.service.js.map