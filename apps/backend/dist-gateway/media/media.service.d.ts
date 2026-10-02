import { Prisma } from '@prisma/client';
import { AppConfig } from '../shared/config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../shared/storage/storage.service';
import { AiModelRegistry } from '../ai/model.registry';
import { AiProviderRegistry } from '../ai/provider.registry';
import { ProviderHealthService } from '../ai/provider-health.service';
import { SessionUser } from '../auth/session.model';
import { ImageGenerationService } from './image-generation.service';
import { VideoGenerationService } from './video-generation.service';
export type GenerationListQuery = {
    status?: string;
    projectId?: number;
    limit?: number;
};
export type AssetListQuery = {
    kind?: string;
    generationId?: string;
    projectId?: number;
    limit?: number;
};
type AssetSummary = Prisma.MediaAssetGetPayload<{
    select: typeof ASSET_SELECT;
}>;
declare const ASSET_SELECT: {
    readonly id: true;
    readonly kind: true;
    readonly mimeType: true;
    readonly sizeBytes: true;
    readonly width: true;
    readonly height: true;
    readonly durationMs: true;
    readonly hasAudio: true;
    readonly sha256: true;
    readonly note: true;
    readonly prompt: true;
    readonly enhancedPrompt: true;
    readonly style: true;
    readonly aspectRatio: true;
    readonly provider: true;
    readonly model: true;
    readonly generationId: true;
    readonly videoGenerationId: true;
    readonly projectId: true;
    readonly createdAt: true;
};
/**
 * Phase 13 media service.
 *
 * Every read is owner-scoped and answers 404 for someone else's generation or
 * asset, never 403: the existence of another account's media is not this caller's
 * business. The absolute path of a stored file never leaves the process, and bytes
 * are served only through an authenticated, integrity-checked route.
 */
export declare class MediaService {
    private readonly prisma;
    private readonly storage;
    private readonly models;
    private readonly providers;
    private readonly health;
    private readonly generation;
    private readonly video;
    private readonly config;
    constructor(prisma: PrismaService, storage: StorageService, models: AiModelRegistry, providers: AiProviderRegistry, health: ProviderHealthService, generation: ImageGenerationService, video: VideoGenerationService, config: AppConfig);
    /**
     * What image generation can actually do right now.
     *
     * "Available" here means a provider is registered and healthy. It is *not* a
     * claim that the key can pay: a free-tier key can be healthy and still be
     * refused with a zero image quota, so the most recent real failure for this
     * account is reported next to the capability rather than hidden behind it.
     */
    capabilities(userId: number): Promise<{
        generation: {
            available: boolean;
            /**
             * Provider health is per provider and each adapter derives it from the
             * capability it was written for, so a healthy Gemini here is a statement
             * about its *text* model. It is reported separately for exactly that
             * reason and is never used to promise that an image can be rendered.
             */
            allProvidersHealthy: boolean;
            providers: {
                provider: string;
                status: "healthy" | "unconfigured" | "unavailable";
                healthDetail: string | null;
                circuit: import("../ai/routing.types").CircuitState;
                stats: import("../ai/routing.types").ProviderRuntimeStats;
            }[];
            models: {
                id: string;
                provider: string;
                /** Aliases stay selectable by hand but are never chosen automatically. */
                autoSelectable: boolean;
                aliasOf: string | null;
            }[];
            aspectRatios: string[];
            styles: {
                id: string;
                label: string;
            }[];
            enhancementAvailable: boolean;
            maxPromptCharacters: number;
            maxImagesPerRequest: number;
            maxImageBytes: number;
            maxAssetsPerUser: number;
            maxTotalBytesPerUser: number;
            generationsPerHour: number;
            detail: string;
        };
        moderation: {
            enforced: string;
            detail: string;
        };
        video: {
            available: boolean;
            allProvidersHealthy: boolean;
            providers: {
                provider: string;
                status: "healthy" | "unconfigured" | "unavailable";
                healthDetail: string | null;
                circuit: import("../ai/routing.types").CircuitState;
                stats: import("../ai/routing.types").ProviderRuntimeStats;
            }[];
            models: {
                id: string;
                provider: string;
                autoSelectable: boolean;
                aliasOf: string | null;
            }[];
            aspectRatios: string[];
            durations: number[];
            maxPromptCharacters: number;
            maxVideoBytes: number;
            generationsPerHour: number;
            maxConcurrent: number;
            containers: string[];
            imageToVideo: boolean;
            detail: string;
            imageToVideoDetail: string;
        };
        lastFailure: {
            error: string | null;
            id: string;
            createdAt: Date;
            finishReason: string | null;
            errorCode: string | null;
        } | null;
        lastVideoFailure: {
            error: string | null;
            id: string;
            createdAt: Date;
            finishReason: string | null;
            errorCode: string | null;
        } | null;
        usage: {
            assets: number;
            storedBytes: number;
            generations: number;
            videoGenerations: number;
        };
    }>;
    listGenerations(userId: number, query?: GenerationListQuery): Prisma.PrismaPromise<{
        error: string | null;
        id: string;
        status: import(".prisma/client").$Enums.MediaGenerationStatus;
        provider: string | null;
        model: string | null;
        createdAt: Date;
        projectId: number | null;
        _count: {
            assets: number;
        };
        aspectRatio: string | null;
        finishReason: string | null;
        inputTokens: number | null;
        outputTokens: number | null;
        assets: {
            id: string;
            provider: string | null;
            model: string | null;
            createdAt: Date;
            kind: import(".prisma/client").$Enums.MediaKind;
            projectId: number | null;
            durationMs: number | null;
            aspectRatio: string | null;
            videoGenerationId: string | null;
            note: string | null;
            width: number | null;
            height: number | null;
            style: string | null;
            mimeType: string;
            prompt: string | null;
            sha256: string;
            sizeBytes: number;
            enhancedPrompt: string | null;
            hasAudio: boolean | null;
            generationId: string | null;
        }[];
        style: string | null;
        prompt: string;
        cancelRequestedAt: Date | null;
        startedAt: Date | null;
        finishedAt: Date | null;
        warning: string | null;
        enhancedPrompt: string | null;
        requestedCount: number;
        errorCode: string | null;
    }[]>;
    getGeneration(userId: number, id: string): Promise<{
        error: string | null;
        id: string;
        status: import(".prisma/client").$Enums.MediaGenerationStatus;
        provider: string | null;
        model: string | null;
        createdAt: Date;
        projectId: number | null;
        _count: {
            assets: number;
        };
        aspectRatio: string | null;
        finishReason: string | null;
        inputTokens: number | null;
        outputTokens: number | null;
        assets: {
            id: string;
            provider: string | null;
            model: string | null;
            createdAt: Date;
            kind: import(".prisma/client").$Enums.MediaKind;
            projectId: number | null;
            durationMs: number | null;
            aspectRatio: string | null;
            videoGenerationId: string | null;
            note: string | null;
            width: number | null;
            height: number | null;
            style: string | null;
            mimeType: string;
            prompt: string | null;
            sha256: string;
            sizeBytes: number;
            enhancedPrompt: string | null;
            hasAudio: boolean | null;
            generationId: string | null;
        }[];
        style: string | null;
        prompt: string;
        cancelRequestedAt: Date | null;
        startedAt: Date | null;
        finishedAt: Date | null;
        warning: string | null;
        enhancedPrompt: string | null;
        requestedCount: number;
        errorCode: string | null;
    }>;
    start(user: SessionUser, input: {
        prompt: string;
        style?: string;
        enhance?: boolean;
        aspectRatio?: string;
        count?: number;
        projectId?: number | null;
        model?: string;
    }): Promise<{
        error: string | null;
        id: string;
        status: import(".prisma/client").$Enums.MediaGenerationStatus;
        provider: string | null;
        model: string | null;
        createdAt: Date;
        projectId: number | null;
        _count: {
            assets: number;
        };
        aspectRatio: string | null;
        finishReason: string | null;
        inputTokens: number | null;
        outputTokens: number | null;
        assets: {
            id: string;
            provider: string | null;
            model: string | null;
            createdAt: Date;
            kind: import(".prisma/client").$Enums.MediaKind;
            projectId: number | null;
            durationMs: number | null;
            aspectRatio: string | null;
            videoGenerationId: string | null;
            note: string | null;
            width: number | null;
            height: number | null;
            style: string | null;
            mimeType: string;
            prompt: string | null;
            sha256: string;
            sizeBytes: number;
            enhancedPrompt: string | null;
            hasAudio: boolean | null;
            generationId: string | null;
        }[];
        style: string | null;
        prompt: string;
        cancelRequestedAt: Date | null;
        startedAt: Date | null;
        finishedAt: Date | null;
        warning: string | null;
        enhancedPrompt: string | null;
        requestedCount: number;
        errorCode: string | null;
    }>;
    listVideoGenerations(userId: number, query?: GenerationListQuery): Prisma.PrismaPromise<{
        error: string | null;
        id: string;
        status: import(".prisma/client").$Enums.MediaGenerationStatus;
        provider: string | null;
        model: string | null;
        createdAt: Date;
        projectId: number | null;
        _count: {
            assets: number;
        };
        aspectRatio: string | null;
        finishReason: string | null;
        requestedSeconds: number;
        inputTokens: number | null;
        outputTokens: number | null;
        assets: {
            id: string;
            provider: string | null;
            model: string | null;
            createdAt: Date;
            kind: import(".prisma/client").$Enums.MediaKind;
            projectId: number | null;
            durationMs: number | null;
            aspectRatio: string | null;
            videoGenerationId: string | null;
            note: string | null;
            width: number | null;
            height: number | null;
            style: string | null;
            mimeType: string;
            prompt: string | null;
            sha256: string;
            sizeBytes: number;
            enhancedPrompt: string | null;
            hasAudio: boolean | null;
            generationId: string | null;
        }[];
        prompt: string;
        cancelRequestedAt: Date | null;
        startedAt: Date | null;
        finishedAt: Date | null;
        warning: string | null;
        errorCode: string | null;
        sourceAssetId: string | null;
    }[]>;
    getVideoGeneration(userId: number, id: string): Promise<{
        error: string | null;
        id: string;
        status: import(".prisma/client").$Enums.MediaGenerationStatus;
        provider: string | null;
        model: string | null;
        createdAt: Date;
        projectId: number | null;
        _count: {
            assets: number;
        };
        aspectRatio: string | null;
        finishReason: string | null;
        requestedSeconds: number;
        inputTokens: number | null;
        outputTokens: number | null;
        assets: {
            id: string;
            provider: string | null;
            model: string | null;
            createdAt: Date;
            kind: import(".prisma/client").$Enums.MediaKind;
            projectId: number | null;
            durationMs: number | null;
            aspectRatio: string | null;
            videoGenerationId: string | null;
            note: string | null;
            width: number | null;
            height: number | null;
            style: string | null;
            mimeType: string;
            prompt: string | null;
            sha256: string;
            sizeBytes: number;
            enhancedPrompt: string | null;
            hasAudio: boolean | null;
            generationId: string | null;
        }[];
        prompt: string;
        cancelRequestedAt: Date | null;
        startedAt: Date | null;
        finishedAt: Date | null;
        warning: string | null;
        errorCode: string | null;
        sourceAssetId: string | null;
    }>;
    startVideo(user: SessionUser, input: {
        prompt: string;
        aspectRatio?: string;
        seconds?: number;
        audio?: boolean;
        projectId?: number | null;
        model?: string;
        sourceAssetId?: string;
    }): Promise<{
        error: string | null;
        id: string;
        status: import(".prisma/client").$Enums.MediaGenerationStatus;
        provider: string | null;
        model: string | null;
        createdAt: Date;
        projectId: number | null;
        _count: {
            assets: number;
        };
        aspectRatio: string | null;
        finishReason: string | null;
        requestedSeconds: number;
        inputTokens: number | null;
        outputTokens: number | null;
        assets: {
            id: string;
            provider: string | null;
            model: string | null;
            createdAt: Date;
            kind: import(".prisma/client").$Enums.MediaKind;
            projectId: number | null;
            durationMs: number | null;
            aspectRatio: string | null;
            videoGenerationId: string | null;
            note: string | null;
            width: number | null;
            height: number | null;
            style: string | null;
            mimeType: string;
            prompt: string | null;
            sha256: string;
            sizeBytes: number;
            enhancedPrompt: string | null;
            hasAudio: boolean | null;
            generationId: string | null;
        }[];
        prompt: string;
        cancelRequestedAt: Date | null;
        startedAt: Date | null;
        finishedAt: Date | null;
        warning: string | null;
        errorCode: string | null;
        sourceAssetId: string | null;
    }>;
    removeVideoGeneration(userId: number, id: string): Promise<void>;
    listAssets(userId: number, query?: AssetListQuery): Prisma.PrismaPromise<{
        id: string;
        provider: string | null;
        model: string | null;
        createdAt: Date;
        kind: import(".prisma/client").$Enums.MediaKind;
        projectId: number | null;
        durationMs: number | null;
        aspectRatio: string | null;
        videoGenerationId: string | null;
        note: string | null;
        width: number | null;
        height: number | null;
        style: string | null;
        mimeType: string;
        prompt: string | null;
        sha256: string;
        sizeBytes: number;
        enhancedPrompt: string | null;
        hasAudio: boolean | null;
        generationId: string | null;
    }[]>;
    getAsset(userId: number, id: string): Promise<{
        id: string;
        provider: string | null;
        model: string | null;
        createdAt: Date;
        kind: import(".prisma/client").$Enums.MediaKind;
        projectId: number | null;
        durationMs: number | null;
        aspectRatio: string | null;
        videoGenerationId: string | null;
        note: string | null;
        width: number | null;
        height: number | null;
        style: string | null;
        mimeType: string;
        prompt: string | null;
        sha256: string;
        sizeBytes: number;
        enhancedPrompt: string | null;
        hasAudio: boolean | null;
        generationId: string | null;
    }>;
    /**
     * Read the stored bytes. The SHA-256 recorded when the image was written is
     * checked on the way out, so a file damaged on disk is reported instead of being
     * served as though it were the image that was generated.
     */
    readAsset(userId: number, id: string): Promise<{
        asset: AssetSummary;
        bytes: Buffer;
    }>;
    removeAsset(userId: number, id: string): Promise<void>;
    removeGeneration(userId: number, id: string): Promise<void>;
    private requireAssetRow;
    private assetSummary;
    private requireGeneration;
    private requireVideoGeneration;
}
export {};
