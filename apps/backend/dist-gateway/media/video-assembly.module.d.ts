import { SessionUser } from '../auth/session.model';
import { AuditService } from '../security/audit.service';
import { CreateAssemblyDto } from './dto/assembly.dto';
import { VideoAssemblyService } from './video-assembly.service';
/**
 * `POST /media/assembly`, mounted on its own path.
 *
 * Deliberately a different route from `/media/video-generations`. Sharing a
 * controller and a path prefix would have been less code, and it would also have
 * made an assembled slideshow and a generated clip indistinguishable to any client
 * that guessed the URL. Separate routes mean the UI can offer them as the two
 * different things they are, and neither can be reached by replaying the other's
 * request body.
 *
 * The controller stays thin: validate, call the service, audit. The rate limit is
 * 6 per hour per account rather than the 20 per 15 minutes video generation allows,
 * because each assembly is minutes of provider time against a grant of 600 seconds
 * that does not refill, so the ceiling is a budget question and not a load one.
 */
export declare class VideoAssemblyController {
    private readonly assembly;
    private readonly audit;
    constructor(assembly: VideoAssemblyService, audit: AuditService);
    capabilities(): Promise<{
        available: boolean;
        provider: string;
        status: "healthy" | "unconfigured" | "degraded";
        detail: string;
        resolutions: readonly ("hd" | "sd" | "full-hd")[];
        maxSeconds: number;
        remainingSeconds: number | null;
        remainingReadable: boolean;
        voiceoverAvailable: boolean;
        watermarked: boolean;
        nonRenewing: boolean;
        maxBytes: number;
    }>;
    start(user: SessionUser, body: CreateAssemblyDto): Promise<{
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
}
/**
 * A separate module, for the same reason the route is separate.
 *
 * `JSON2VIDEO_ENABLED` gates whether the provider can do anything at all, so this
 * module being imported by the app root does not mean assembly is on. Gating the
 * controller rather than the module keeps the wiring visible: an operator sees the
 * endpoint in the route table and gets a clear refusal, instead of a 404 that looks
 * like a typo. The provider reports `unconfigured` with an explanatory detail when
 * no key is set, which the UI shows as the reason the button is unavailable.
 */
export declare class VideoAssemblyModule {
}
