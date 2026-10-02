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
exports.MediaService = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const api_error_1 = require("../shared/errors/api-error");
const inject_config_1 = require("../shared/config/inject-config");
const prisma_service_1 = require("../prisma/prisma.service");
const storage_service_1 = require("../shared/storage/storage.service");
const model_registry_1 = require("../ai/model.registry");
const provider_registry_1 = require("../ai/provider.registry");
const provider_health_service_1 = require("../ai/provider-health.service");
const image_generation_service_1 = require("./image-generation.service");
const image_styles_1 = require("./image-styles");
const video_generation_service_1 = require("./video-generation.service");
const GENERATION_SELECT = {
    id: true,
    prompt: true,
    enhancedPrompt: true,
    style: true,
    aspectRatio: true,
    requestedCount: true,
    status: true,
    error: true,
    errorCode: true,
    warning: true,
    finishReason: true,
    provider: true,
    model: true,
    inputTokens: true,
    outputTokens: true,
    cancelRequestedAt: true,
    startedAt: true,
    finishedAt: true,
    createdAt: true,
    projectId: true,
};
const VIDEO_GENERATION_SELECT = {
    id: true,
    prompt: true,
    aspectRatio: true,
    requestedSeconds: true,
    status: true,
    error: true,
    errorCode: true,
    warning: true,
    finishReason: true,
    provider: true,
    model: true,
    inputTokens: true,
    outputTokens: true,
    cancelRequestedAt: true,
    startedAt: true,
    finishedAt: true,
    createdAt: true,
    projectId: true,
    sourceAssetId: true,
};
const ASSET_SELECT = {
    id: true,
    kind: true,
    mimeType: true,
    sizeBytes: true,
    width: true,
    height: true,
    durationMs: true,
    hasAudio: true,
    sha256: true,
    note: true,
    prompt: true,
    enhancedPrompt: true,
    style: true,
    aspectRatio: true,
    provider: true,
    model: true,
    generationId: true,
    videoGenerationId: true,
    projectId: true,
    createdAt: true,
};
/**
 * Phase 13 media service.
 *
 * Every read is owner-scoped and answers 404 for someone else's generation or
 * asset, never 403: the existence of another account's media is not this caller's
 * business. The absolute path of a stored file never leaves the process, and bytes
 * are served only through an authenticated, integrity-checked route.
 */
let MediaService = class MediaService {
    prisma;
    storage;
    models;
    providers;
    health;
    generation;
    video;
    config;
    constructor(prisma, storage, models, providers, health, generation, video, config) {
        this.prisma = prisma;
        this.storage = storage;
        this.models = models;
        this.providers = providers;
        this.health = health;
        this.generation = generation;
        this.video = video;
        this.config = config;
    }
    /**
     * What image generation can actually do right now.
     *
     * "Available" here means a provider is registered and healthy. It is *not* a
     * claim that the key can pay: a free-tier key can be healthy and still be
     * refused with a zero image quota, so the most recent real failure for this
     * account is reported next to the capability rather than hidden behind it.
     */
    async capabilities(userId) {
        const imageProviders = [...this.providers.capabilities().entries()]
            .filter(([, capabilities]) => capabilities.includes('image-generation'))
            .map(([provider]) => provider);
        const videoProviders = [...this.providers.capabilities().entries()]
            .filter(([, capabilities]) => capabilities.includes('video-generation'))
            .map(([provider]) => provider);
        const [providerEntries, videoProviderEntries] = await Promise.all([
            Promise.all(imageProviders.map(async (provider) => {
                const status = await this.health.status(provider);
                return {
                    provider,
                    status: status.status,
                    healthDetail: status.detail ?? null,
                    circuit: this.health.circuit(provider),
                    stats: this.health.stats(provider),
                };
            })),
            Promise.all(videoProviders.map(async (provider) => {
                const status = await this.health.status(provider);
                return {
                    provider,
                    status: status.status,
                    healthDetail: status.detail ?? null,
                    circuit: this.health.circuit(provider),
                    stats: this.health.stats(provider),
                };
            })),
        ]);
        const providers = providerEntries;
        const videoProviderStatuses = videoProviderEntries;
        const models = this.models
            .list()
            .filter((model) => model.capabilities.includes('image-generation'))
            .map((model) => ({
            id: model.id,
            provider: model.provider,
            /** Aliases stay selectable by hand but are never chosen automatically. */
            autoSelectable: model.enabled !== false,
            aliasOf: model.aliasOf ?? null,
        }));
        const videoModels = this.models
            .list()
            .filter((model) => model.capabilities.includes('video-generation'))
            .map((model) => ({
            id: model.id,
            provider: model.provider,
            autoSelectable: model.enabled !== false,
            aliasOf: model.aliasOf ?? null,
        }));
        const [assetCount, storedBytes, generationCount, lastFailure, lastVideoFailure, videoGenerationCount] = await Promise.all([
            this.prisma.mediaAsset.count({ where: { userId } }),
            this.prisma.mediaAsset.aggregate({ where: { userId }, _sum: { sizeBytes: true } }),
            this.prisma.imageGeneration.count({ where: { userId } }),
            this.prisma.imageGeneration.findFirst({
                where: { userId, status: 'FAILED' },
                orderBy: { updatedAt: 'desc' },
                select: { id: true, errorCode: true, error: true, finishReason: true, createdAt: true },
            }),
            this.prisma.videoGeneration.findFirst({
                where: { userId, status: 'FAILED' },
                orderBy: { updatedAt: 'desc' },
                select: { id: true, errorCode: true, error: true, finishReason: true, createdAt: true },
            }),
            this.prisma.videoGeneration.count({ where: { userId } }),
        ]);
        const available = models.length > 0 && providers.some((entry) => entry.status !== 'unconfigured');
        const allHealthy = available && providers.every((entry) => entry.status === 'healthy');
        /**
         * Enhancement is offered only when a text model is actually registered, so the
         * UI can tell the user up front that the rewrite will run rather than failing
         * it silently and quietly rendering from the original words.
         */
        const enhancementAvailable = this.models
            .routable('language', 'hybrid')
            .some((model) => model.provider !== 'pollinations');
        /**
         * Video answers the same question separately, because "a provider is
         * registered for video" and "this account can pay for a clip" are different
         * facts and conflating them is how a UI ends up offering a button that always
         * fails. `available` needs a registered, configured renderer; `lastFailure` is
         * what actually came back the last time.
         */
        const videoAvailable = videoModels.length > 0 && videoProviderStatuses.some((entry) => entry.status !== 'unconfigured');
        const videoAllHealthy = videoAvailable && videoProviderStatuses.length > 0 && videoProviderStatuses.every((entry) => entry.status === 'healthy');
        return {
            generation: {
                available,
                /**
                 * Provider health is per provider and each adapter derives it from the
                 * capability it was written for, so a healthy Gemini here is a statement
                 * about its *text* model. It is reported separately for exactly that
                 * reason and is never used to promise that an image can be rendered.
                 */
                allProvidersHealthy: allHealthy,
                providers,
                models,
                aspectRatios: this.config.media.aspectRatios,
                styles: image_styles_1.IMAGE_STYLES.map((style) => ({ id: style.id, label: style.label })),
                enhancementAvailable,
                maxPromptCharacters: this.config.media.maxPromptCharacters,
                maxImagesPerRequest: this.config.media.maxImagesPerRequest,
                maxImageBytes: this.config.media.maxImageBytes,
                maxAssetsPerUser: this.config.media.maxAssetsPerUser,
                maxTotalBytesPerUser: this.config.media.maxTotalBytesPerUser,
                generationsPerHour: this.config.media.generationsPerHour,
                detail: available
                    ? 'Images come from a provider that really renders them. A run is only reported as completed when the bytes were stored, and a refusal, a quota error or a missing model is reported as the failure it is. Being registered is not proof the key can pay: read lastFailure for what this account actually got back.'
                    : 'No configured provider can generate images. Nothing is substituted or synthesised locally.',
            },
            moderation: {
                enforced: 'provider-reported',
                detail: "A blocked prompt is recorded with the provider's own finish reason (for example IMAGE_SAFETY or PROHIBITED_CONTENT) as a failed run. ISOBASH runs no classifier of its own, so it does not claim to have screened anything itself.",
            },
            video: {
                available: videoAvailable,
                allProvidersHealthy: videoAllHealthy,
                providers: videoProviderStatuses,
                models: videoModels,
                aspectRatios: this.config.media.video.aspectRatios,
                durations: this.config.media.video.durations,
                maxPromptCharacters: this.config.media.video.maxPromptCharacters,
                maxVideoBytes: this.config.media.video.maxVideoBytes,
                generationsPerHour: this.config.media.video.generationsPerHour,
                maxConcurrent: this.config.media.video.maxConcurrent,
                containers: ['video/mp4', 'video/quicktime', 'video/webm'],
                imageToVideo: videoAvailable,
                detail: videoAvailable
                    ? 'Clips come from a provider that really renders video. The container, frame size, duration and audio track stored on an asset are read out of the returned bytes, not taken from the provider\'s claim or from the length you asked for, and a clip shorter than requested is reported as such. A render holds a provider connection open for minutes, so this build runs a bounded number at a time.'
                    : 'No configured provider can generate video. Text-to-video, image-to-video and animation are not synthesised locally, so nothing on this page renders a clip.',
                imageToVideoDetail: 'Image-to-video uploads the chosen first frame to the provider and passes back its URL, because the provider needs a public link and this app deliberately does not publish its own media. The frame is therefore retrievable by that URL on the provider\'s side until it expires.',
            },
            lastFailure,
            lastVideoFailure,
            usage: {
                assets: assetCount,
                storedBytes: storedBytes._sum.sizeBytes ?? 0,
                generations: generationCount,
                videoGenerations: videoGenerationCount,
            },
        };
    }
    listGenerations(userId, query = {}) {
        return this.prisma.imageGeneration.findMany({
            where: {
                userId,
                ...(query.status ? { status: query.status } : {}),
                ...(query.projectId !== undefined ? { projectId: query.projectId } : {}),
            },
            orderBy: { createdAt: 'desc' },
            take: clamp(query.limit ?? 50, 1, 200),
            select: {
                ...GENERATION_SELECT,
                assets: { orderBy: { id: 'asc' }, select: ASSET_SELECT },
                _count: { select: { assets: true } },
            },
        });
    }
    async getGeneration(userId, id) {
        return this.requireGeneration(userId, id);
    }
    async start(user, input) {
        const prompt = input.prompt.trim();
        if (prompt.length === 0) {
            throw new api_error_1.ApiError('A prompt is required.', 400, 'VALIDATION_FAILED');
        }
        if (prompt.length > this.config.media.maxPromptCharacters) {
            throw new api_error_1.ApiError(`The prompt is ${prompt.length} characters, over the ${this.config.media.maxPromptCharacters} character limit.`, 400, 'VALIDATION_FAILED');
        }
        // The style is validated against the shipped list, not merely "present", so a
        // typo is refused instead of rendering an image with no style while the UI
        // claimed one was applied.
        const style = (0, image_styles_1.normaliseStyleId)(input.style);
        if (input.style != null && input.style.trim() !== '' && style === null) {
            throw new api_error_1.ApiError(`Style "${input.style}" is not offered. Accepted: ${image_styles_1.IMAGE_STYLES.map((s) => s.id).join(', ')}.`, 400, 'VALIDATION_FAILED');
        }
        const aspectRatio = input.aspectRatio ?? null;
        if (aspectRatio && !this.config.media.aspectRatios.includes(aspectRatio)) {
            throw new api_error_1.ApiError(`Aspect ratio "${aspectRatio}" is not offered. Accepted: ${this.config.media.aspectRatios.join(', ')}.`, 400, 'VALIDATION_FAILED');
        }
        const count = input.count ?? 1;
        if (input.projectId !== undefined && input.projectId !== null) {
            const owned = await this.prisma.project.findFirst({
                where: { id: input.projectId, ownerId: user.id },
                select: { id: true },
            });
            if (!owned) {
                throw new api_error_1.ApiError('Project not found.', 400, 'VALIDATION_FAILED');
            }
        }
        const request = {
            prompt,
            style,
            enhance: input.enhance === true,
            aspectRatio,
            count,
            projectId: input.projectId ?? null,
            model: input.model ?? null,
        };
        const created = await this.generation.start(user.id, request);
        return this.requireGeneration(user.id, created.id);
    }
    listVideoGenerations(userId, query = {}) {
        return this.prisma.videoGeneration.findMany({
            where: {
                userId,
                ...(query.status ? { status: query.status } : {}),
                ...(query.projectId !== undefined ? { projectId: query.projectId } : {}),
            },
            orderBy: { createdAt: 'desc' },
            take: clamp(query.limit ?? 50, 1, 200),
            select: {
                ...VIDEO_GENERATION_SELECT,
                assets: { orderBy: { id: 'asc' }, select: ASSET_SELECT },
                _count: { select: { assets: true } },
            },
        });
    }
    async getVideoGeneration(userId, id) {
        return this.requireVideoGeneration(userId, id);
    }
    async startVideo(user, input) {
        const prompt = input.prompt.trim();
        if (prompt.length === 0) {
            throw new api_error_1.ApiError('A prompt is required.', 400, 'VALIDATION_FAILED');
        }
        if (prompt.length > this.config.media.video.maxPromptCharacters) {
            throw new api_error_1.ApiError(`The prompt is ${prompt.length} characters, over the ${this.config.media.video.maxPromptCharacters} character limit.`, 400, 'VALIDATION_FAILED');
        }
        const aspectRatio = input.aspectRatio ?? null;
        if (aspectRatio && !this.config.media.video.aspectRatios.includes(aspectRatio)) {
            throw new api_error_1.ApiError(`Aspect ratio "${aspectRatio}" is not offered for video. Accepted: ${this.config.media.video.aspectRatios.join(', ')}.`, 400, 'VALIDATION_FAILED');
        }
        // The length is validated against the configured allow-list rather than a range:
        // video models do not accept every second count (Veo takes 4, 6 or 8), so
        // offering 5 would be offering a request that cannot be honoured.
        const seconds = input.seconds ?? this.config.media.video.durations[0];
        if (!this.config.media.video.durations.includes(seconds)) {
            throw new api_error_1.ApiError(`A ${seconds}s clip is not offered. Accepted lengths: ${this.config.media.video.durations.join(', ')} seconds.`, 400, 'VALIDATION_FAILED');
        }
        if (input.projectId !== undefined && input.projectId !== null) {
            const owned = await this.prisma.project.findFirst({
                where: { id: input.projectId, ownerId: user.id },
                select: { id: true },
            });
            if (!owned) {
                throw new api_error_1.ApiError('Project not found.', 400, 'VALIDATION_FAILED');
            }
        }
        let sourceAssetId = null;
        if (input.sourceAssetId) {
            const source = await this.prisma.mediaAsset.findFirst({
                where: { id: input.sourceAssetId, userId: user.id, kind: 'IMAGE' },
                select: { id: true },
            });
            if (!source) {
                throw new api_error_1.ApiError('The first-frame image was not found in your media library. It has to be an image this account stored.', 400, 'VALIDATION_FAILED');
            }
            sourceAssetId = source.id;
        }
        const request = {
            prompt,
            aspectRatio,
            durationSeconds: seconds,
            withAudio: input.audio === true,
            projectId: input.projectId ?? null,
            model: input.model ?? null,
            sourceAssetId,
        };
        const created = await this.video.start(user.id, request);
        return this.requireVideoGeneration(user.id, created.id);
    }
    async removeVideoGeneration(userId, id) {
        const generation = await this.requireVideoGeneration(userId, id);
        const stored = await this.prisma.mediaAsset.findMany({
            where: { videoGenerationId: id, userId },
            select: { relativePath: true },
        });
        for (const asset of stored) {
            await this.storage.remove('media', asset.relativePath);
        }
        /**
         * The asset rows go with the run. `MediaAsset.videoGenerationId` is `SetNull`,
         * so deleting only the run would leave a row whose blob is gone: an asset the
         * library still lists and that now fails to serve. Deleting the files first
         * means a crash in between leaves a row without a file rather than a file with
         * no row, which is the recoverable direction.
         */
        await this.prisma.$transaction([
            this.prisma.mediaAsset.deleteMany({ where: { videoGenerationId: id, userId } }),
            this.prisma.videoGeneration.delete({ where: { id: generation.id } }),
        ]);
    }
    listAssets(userId, query = {}) {
        return this.prisma.mediaAsset.findMany({
            where: {
                userId,
                ...(query.kind ? { kind: query.kind } : {}),
                ...(query.generationId
                    ? { OR: [{ generationId: query.generationId }, { videoGenerationId: query.generationId }] }
                    : {}),
                ...(query.projectId !== undefined ? { projectId: query.projectId } : {}),
            },
            orderBy: { createdAt: 'desc' },
            take: clamp(query.limit ?? 60, 1, 200),
            select: ASSET_SELECT,
        });
    }
    async getAsset(userId, id) {
        const asset = await this.prisma.mediaAsset.findFirst({ where: { id, userId }, select: ASSET_SELECT });
        if (!asset) {
            throw new common_1.NotFoundException('Media asset not found.');
        }
        return asset;
    }
    /**
     * Read the stored bytes. The SHA-256 recorded when the image was written is
     * checked on the way out, so a file damaged on disk is reported instead of being
     * served as though it were the image that was generated.
     */
    async readAsset(userId, id) {
        const row = await this.requireAssetRow(userId, id);
        const bytes = await this.storage.read('media', row.relativePath);
        const actual = (0, node_crypto_1.createHash)('sha256').update(bytes).digest('hex');
        if (actual !== row.sha256) {
            throw new api_error_1.ApiError('The stored bytes for this asset no longer match the checksum recorded when it was generated. The file on disk is damaged.', 500, 'ASSET_CORRUPT');
        }
        return { asset: await this.assetSummary(id), bytes };
    }
    async removeAsset(userId, id) {
        const asset = await this.requireAssetRow(userId, id);
        await this.prisma.mediaAsset.delete({ where: { id: asset.id } });
        // The row is the source of truth; a leftover blob must not keep the space.
        await this.storage.remove('media', asset.relativePath);
    }
    async removeGeneration(userId, id) {
        const generation = await this.requireGeneration(userId, id);
        const stored = await this.prisma.mediaAsset.findMany({
            where: { generationId: id, userId },
            select: { relativePath: true },
        });
        for (const asset of stored) {
            await this.storage.remove('media', asset.relativePath);
        }
        // Same reasoning as the video path: `MediaAsset.generationId` is `SetNull`, so
        // the rows have to be removed here or the library keeps listing dead assets.
        await this.prisma.$transaction([
            this.prisma.mediaAsset.deleteMany({ where: { generationId: id, userId } }),
            this.prisma.imageGeneration.delete({ where: { id: generation.id } }),
        ]);
    }
    async requireAssetRow(userId, id) {
        const asset = await this.prisma.mediaAsset.findFirst({ where: { id, userId } });
        if (!asset) {
            throw new common_1.NotFoundException('Media asset not found.');
        }
        return asset;
    }
    async assetSummary(id) {
        const asset = await this.prisma.mediaAsset.findUnique({ where: { id }, select: ASSET_SELECT });
        if (!asset) {
            throw new common_1.NotFoundException('Media asset not found.');
        }
        return asset;
    }
    async requireGeneration(userId, id) {
        const generation = await this.prisma.imageGeneration.findFirst({
            where: { id, userId },
            select: {
                ...GENERATION_SELECT,
                assets: { orderBy: { id: 'asc' }, select: ASSET_SELECT },
                _count: { select: { assets: true } },
            },
        });
        if (!generation) {
            throw new common_1.NotFoundException('Image generation not found.');
        }
        return generation;
    }
    async requireVideoGeneration(userId, id) {
        const generation = await this.prisma.videoGeneration.findFirst({
            where: { id, userId },
            select: {
                ...VIDEO_GENERATION_SELECT,
                assets: { orderBy: { id: 'asc' }, select: ASSET_SELECT },
                _count: { select: { assets: true } },
            },
        });
        if (!generation) {
            throw new common_1.NotFoundException('Video generation not found.');
        }
        return generation;
    }
};
exports.MediaService = MediaService;
exports.MediaService = MediaService = __decorate([
    (0, common_1.Injectable)(),
    __param(7, (0, inject_config_1.InjectConfig)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        storage_service_1.StorageService,
        model_registry_1.AiModelRegistry,
        provider_registry_1.AiProviderRegistry,
        provider_health_service_1.ProviderHealthService,
        image_generation_service_1.ImageGenerationService,
        video_generation_service_1.VideoGenerationService, Object])
], MediaService);
function clamp(value, min, max) {
    return Math.min(Math.max(Number.isFinite(value) ? value : min, min), max);
}
//# sourceMappingURL=media.service.js.map