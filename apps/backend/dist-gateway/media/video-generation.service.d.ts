import { EntitlementsService } from '../billing/entitlements.service';
import { OnModuleDestroy } from '@nestjs/common';
import { AppConfig } from '../shared/config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../shared/storage/storage.service';
import { RealtimeService } from '../realtime/realtime.service';
import { AiRouterService } from '../ai/ai-router.service';
import { ProviderCreditService } from '../ai/provider-credit.service';
import { QueueService } from '../queues/queue.service';
export type StartVideoGeneration = {
    prompt: string;
    aspectRatio: string | null;
    durationSeconds: number;
    withAudio: boolean;
    projectId: number | null;
    model: string | null;
    /** A stored IMAGE asset of this account to use as the first frame. */
    sourceAssetId: string | null;
};
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
export declare class VideoGenerationService implements OnModuleDestroy {
    private readonly prisma;
    private readonly storage;
    private readonly ai;
    private readonly realtime;
    private readonly credits;
    private readonly queue;
    private readonly entitlements;
    private readonly config;
    private readonly log;
    private readonly running;
    private inFlight;
    private readonly waiters;
    constructor(prisma: PrismaService, storage: StorageService, ai: AiRouterService, realtime: RealtimeService, credits: ProviderCreditService, queue: QueueService, entitlements: EntitlementsService, config: AppConfig);
    onModuleDestroy(): void;
    start(userId: number, input: StartVideoGeneration): Promise<{
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
    }>;
    /** Enqueue a render, refusing to queue the same run twice (`jobId` dedupes). */
    private enqueueRender;
    /** Request a cancel. The run stops at its next checkpoint and is never revived. */
    cancel(userId: number, id: string): Promise<{
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
    private track;
    /**
     * Run one render to its terminal state.
     *
     * Runnable from the request process (inline fallback) and the worker (the normal
     * path), and idempotent against a retry: a run that already ended returns without
     * touching anything, and a run whose provider project already exists resumes it
     * instead of creating a second one.
     */
    execute(generationId: string, userId: number, input: StartVideoGeneration): Promise<void>;
    /**
     * Write the bytes first, then describe them. A row that claims a clip which is
     * not on disk would be a lie the player would happily render as broken.
     */
    private store;
    /**
     * Read a stored image back out to hand to the provider as the first frame. The
     * asset has to be this account's and has to be an image: an id that names
     * someone else's clip is not a first frame.
     */
    private loadSourceImage;
    /** A server-generated path; nothing a provider or caller supplied reaches the disk. */
    private relativePathFor;
    private isCancelled;
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
    private recordProgress;
    private finishCancelled;
    private fail;
    /**
     * Bound how many video renders this process will have open at once. A clip can
     * hold a provider connection open for minutes; without a ceiling a handful of
     * requests would starve every other feature sharing the event loop.
     */
    private acquireSlot;
    private releaseSlot;
    private assertQuota;
    private require;
    private emit;
}
