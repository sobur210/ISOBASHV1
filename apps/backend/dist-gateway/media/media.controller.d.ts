import { Response } from 'express';
import { SessionUser } from '../auth/session.model';
import { AuditService } from '../security/audit.service';
import { CreateImageGenerationDto, CreateVideoGenerationDto } from './dto/media.dto';
import { ImageGenerationService } from './image-generation.service';
import { VideoGenerationService } from './video-generation.service';
import { MediaService } from './media.service';
export declare class MediaController {
    private readonly media;
    private readonly generation;
    private readonly videoGeneration;
    private readonly audit;
    constructor(media: MediaService, generation: ImageGenerationService, videoGeneration: VideoGenerationService, audit: AuditService);
    /** What image generation can actually do right now, including the last real failure. */
    capabilities(user: SessionUser): Promise<{
        generation: {
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
    listGenerations(user: SessionUser, status?: string, projectId?: string, limit?: string): import(".prisma/client").Prisma.PrismaPromise<{
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
    start(user: SessionUser, body: CreateImageGenerationDto): Promise<{
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
    getGeneration(user: SessionUser, id: string): Promise<{
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
    cancel(user: SessionUser, id: string): Promise<{
        error: string | null;
        id: string;
        status: import(".prisma/client").$Enums.MediaGenerationStatus;
        provider: string | null;
        model: string | null;
        createdAt: Date;
        updatedAt: Date;
        userId: number;
        projectId: number | null;
        aspectRatio: string | null;
        finishReason: string | null;
        inputTokens: number | null;
        outputTokens: number | null;
        style: string | null;
        prompt: string;
        cancelRequestedAt: Date | null;
        startedAt: Date | null;
        finishedAt: Date | null;
        warning: string | null;
        enhancedPrompt: string | null;
        requestedCount: number;
        errorCode: string | null;
    } | null>;
    removeGeneration(user: SessionUser, id: string): Promise<void>;
    listVideoGenerations(user: SessionUser, status?: string, projectId?: string, limit?: string): import(".prisma/client").Prisma.PrismaPromise<{
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
    /**
     * One clip per request. The rate limit is far lower than the image route's
     * because a render holds a provider connection open for minutes: twenty at once
     * would be twenty of them, not twenty quick answers.
     */
    startVideo(user: SessionUser, body: CreateVideoGenerationDto): Promise<{
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
    getVideoGeneration(user: SessionUser, id: string): Promise<{
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
    cancelVideo(user: SessionUser, id: string): Promise<{
        error: string | null;
        providerProjectId: string | null;
        id: string;
        status: import(".prisma/client").$Enums.MediaGenerationStatus;
        provider: string | null;
        model: string | null;
        createdAt: Date;
        updatedAt: Date;
        userId: number;
        projectId: number | null;
        aspectRatio: string | null;
        finishReason: string | null;
        requestedSeconds: number;
        inputTokens: number | null;
        outputTokens: number | null;
        prompt: string;
        cancelRequestedAt: Date | null;
        startedAt: Date | null;
        finishedAt: Date | null;
        warning: string | null;
        errorCode: string | null;
        sourceAssetId: string | null;
        progressPercent: number | null;
    } | null>;
    removeVideoGeneration(user: SessionUser, id: string): Promise<void>;
    listAssets(user: SessionUser, kind?: string, generationId?: string, projectId?: string, limit?: string): import(".prisma/client").Prisma.PrismaPromise<{
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
    getAsset(user: SessionUser, id: string): Promise<{
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
     * The bytes. Authenticated, owner-scoped and checksum-verified, and served with
     * `nosniff` so the browser cannot be talked into treating a clip as a document.
     *
     * Range requests are answered for real: a `<video>` element that gets a 200 with
     * the whole file cannot seek, and a clip the user cannot scrub through is a worse
     * deliverable than the bytes on disk.
     */
    file(user: SessionUser, id: string, res: Response, download?: string, range?: string): Promise<void>;
    removeAsset(user: SessionUser, id: string): Promise<void>;
}
