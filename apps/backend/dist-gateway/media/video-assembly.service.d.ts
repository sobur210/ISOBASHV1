import { AppConfig } from '../shared/config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../shared/storage/storage.service';
import { Json2VideoProvider } from '../ai/json2video.provider';
import { CreateAssemblyDto } from './dto/assembly.dto';
/**
 * Assembling an existing document into a finished video, via JSON2Video.
 *
 * This service is intentionally NOT reachable from the AI video generation screen
 * and does not implement anything like `VideoProvider`. JSON2Video composes
 * material the user already has; it does not generate a clip from a prompt. Keeping
 * the two apart is what stops a routing bug from ever substituting an assembled
 * slideshow for a generated clip, or the reverse.
 *
 * WHY THIS AWAITS THE WHOLE RATHER THAN QUEUES
 *
 * Assembly is a single POST that renders for a few minutes and returns one MP4. It
 * is unlike Phase 14 video generation, which starts a run, streams status and
 * keeps a row per attempt, for good reasons: those renders are long, concurrent
 * and expensive per second, and a user leaving the tab must not cancel the billing.
 *
 * An assembly is neither long enough nor expensive enough to justify that
 * machinery, and reusing `VideoGenerationService` would mean pretending it is the
 * same kind of work. So the request is awaited, and if it does not finish the
 * caller gets the provider's reason and no asset is written. A failed assembly
 * leaves nothing behind to clean up.
 *
 * The trade-off is stated plainly: a client that disconnects mid-request does not
 * get to see the result, and JSON2Video keeps rendering and still bills for it.
 * That is acceptable for a one-shot action on a document the user is waiting on,
 * and it is the reason this is not exposed as a background job yet.
 */
export declare class VideoAssemblyService {
    private readonly json2video;
    private readonly prisma;
    private readonly storage;
    private readonly config;
    private readonly logger;
    constructor(json2video: Json2VideoProvider, prisma: PrismaService, storage: StorageService, config: AppConfig);
    /**
     * What the assembly screen needs before anyone clicks anything.
     *
     * Returned as its own block rather than folded into `/media/capabilities`,
     * because it is not a renderer competing for the same work: there is no failover
     * provider for assembly, so reporting it as one capability among several would
     * invite a client to try to fall back to something that cannot compose.
     */
    capabilities(): Promise<{
        available: boolean;
        provider: string;
        status: "healthy" | "unconfigured" | "degraded";
        detail: string;
        resolutions: readonly ("hd" | "sd" | "full-hd")[];
        maxSeconds: number;
        /**
         * Null when the provider will not say, which is a different thing from zero.
         * Reporting 0 would render the button dead for a reason the user could not
         * act on, when the truth is "we do not know".
         */
        remainingSeconds: number | null;
        remainingReadable: boolean;
        /**
         * TTS is 0 credits on every current JSON2Video plan, so a narrated video
         * costs the same as a silent one. Flagged because that is unusual enough to
         * change if a plan ever prices voice differently, and a UI that assumed it
         * would then be quietly wrong.
         */
        voiceoverAvailable: boolean;
        /**
         * The free plan's grant does not renew, and its output is watermarked and
         * non-commercial. Said to the client rather than left in a comment so the
         * button can warn before the user spends a one-off grant on a draft.
         */
        watermarked: boolean;
        nonRenewing: boolean;
        maxBytes: number;
    }>;
    /**
     * The provider's own name, for the audit trail.
     *
     * Exposed rather than hardcoded at the call site so the audit records the
     * provider that actually served the request: if assembly is later routed through
     * a second renderer, the log follows it instead of continuing to claim json2video.
     */
    providerName(): string;
    private isEnabled;
    start(userId: number, projectId: number | null, dto: CreateAssemblyDto): Promise<{
        asset: {
            id: string;
            kind: import(".prisma/client").$Enums.MediaKind;
            mimeType: string;
            sizeBytes: number;
            width: number | null;
            height: number | null;
            durationMs: number | null;
            hasAudio: boolean | null;
            provider: string | null;
            note: string | null;
            createdAt: Date;
        };
        projectId: string;
        durationSeconds: number | null;
        remainingSeconds: number | null;
        recipe: Record<string, unknown>;
    }>;
    private relativePathFor;
}
