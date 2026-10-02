import { EntitlementsService } from '../billing/entitlements.service';
import { OnModuleDestroy } from '@nestjs/common';
import { AppConfig } from '../shared/config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../shared/storage/storage.service';
import { RealtimeService } from '../realtime/realtime.service';
import { AiRouterService } from '../ai/ai-router.service';
import { PromptComposerService } from './prompt-composer.service';
export type StartImageGeneration = {
    prompt: string;
    style: string | null;
    enhance: boolean;
    aspectRatio: string | null;
    count: number;
    projectId: number | null;
    model: string | null;
};
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
export declare class ImageGenerationService implements OnModuleDestroy {
    private readonly prisma;
    private readonly storage;
    private readonly ai;
    private readonly realtime;
    private readonly composer;
    private readonly entitlements;
    private readonly config;
    private readonly log;
    private readonly running;
    constructor(prisma: PrismaService, storage: StorageService, ai: AiRouterService, realtime: RealtimeService, composer: PromptComposerService, entitlements: EntitlementsService, config: AppConfig);
    onModuleDestroy(): void;
    start(userId: number, input: StartImageGeneration): Promise<{
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
    }>;
    /** Request a cancel. The run stops at its next checkpoint and is never revived. */
    cancel(userId: number, id: string): Promise<{
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
    private track;
    private execute;
    /**
     * Write the bytes first, then describe them. A row that claims an image which
     * is not on disk would be a lie the gallery would happily render.
     */
    private store;
    /** A server-generated path; nothing a provider or caller supplied reaches the disk. */
    private relativePathFor;
    private isCancelled;
    private finishCancelled;
    private fail;
    private assertQuota;
    private require;
    private emit;
}
