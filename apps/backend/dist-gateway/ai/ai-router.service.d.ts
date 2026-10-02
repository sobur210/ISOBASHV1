import { AiEmbeddingRequest, AiEmbeddingResponse, AiImageResponse, AiMode, AiResponse, AiStreamChunk, AiVideoResponse } from './provider.types';
import { AiVideoRequest } from './video-provider.types';
import { AiProviderRegistry } from './provider.registry';
import { AiModelRegistry } from './model.registry';
import { ProviderHealthService } from './provider-health.service';
import { RouteCandidate, RoutePlan, RouteRequest } from './routing.types';
/**
 * Phase 9: AI orchestration and model routing.
 *
 * The router is the single entry point for every model call. It turns a
 * capability request into an explainable, health-aware plan, executes the best
 * eligible candidate and reports exactly what happened (including failover).
 *
 * Honesty rules baked into the design:
 *  - an explicit provider/model selection is *strict*: no cross-provider fallback;
 *  - provider errors that are real answers (rate limit, bad key, retired model,
 *    overload) are surfaced verbatim instead of being masked by another vendor;
 *  - a stream that already emitted tokens is never re-routed, because a second
 *    vendor's tokens cannot be spliced into a reply the user is reading;
 *  - when nothing can serve the request the router fails with a real error.
 */
export declare class AiRouterService {
    private readonly registry;
    private readonly models;
    private readonly health;
    private readonly log;
    constructor(registry: AiProviderRegistry, models: AiModelRegistry, health: ProviderHealthService);
    mode(): AiMode;
    /** Build (and probe) the routing plan without executing anything. */
    plan(request: RouteRequest): Promise<RoutePlan>;
    /**
     * The provider that would serve a video request right now, without calling one.
     *
     * Runs are queued rather than executed in the request, and a queue is a promise
     * that a process with the right renderer will come for the job. So the decision
     * has to be made before the job is enqueued: `null` means no renderer can take
     * this run at all, and the caller must say so now rather than leave a row waiting
     * on a worker that will never arrive.
     *
     * The plan is built exactly as `generateVideo` builds it (`ignoreProviderHealth`,
     * the same request), so the answer is the provider that call will try first rather
     * than a second opinion from a slightly different question.
     */
    resolveVideoProvider(model?: string | null): Promise<string | null>;
    /** Execute a request through the plan, honouring the failover policy. */
    execute(request: RouteRequest & {
        input: string;
    }): Promise<AiResponse>;
    /**
     * Phase 12 embeddings.
     *
     * The same plan/eligibility/failover rules as `execute`, because an index built
     * from half-embedded chunks is worse than no index: a provider that answers
     * with a real error (bad key, missing model, rate limit) is surfaced instead
     * of being routed around.
     */
    embed(request: RouteRequest & AiEmbeddingRequest): Promise<AiEmbeddingResponse>;
    /**
     * Phase 13 image generation.
     *
     * The same plan/eligibility rules as `execute`, with one difference and an
     * honesty rule. The difference: when the caller pinned nothing, a provider that
     * refuses (zero quota, a bad key, a retired model) does not end the run if
     * another eligible renderer exists. Refusing would make a deployment with a
     * working second renderer unable to draw anything. The honesty rule: the
     * substitution is reported in `failovers` and shown on the run, and a pinned
     * model is still strict, so nothing is ever swapped behind the user's back.
     */
    generateImage(request: RouteRequest & {
        prompt: string;
        aspectRatio?: string;
        count?: number;
    }): Promise<AiImageResponse>;
    /**
     * Phase 14 video generation.
     *
     * The same rules as `generateImage`, and for the same reasons: provider health
     * is per provider and each adapter derives it from the capability it was written
     * for, so a healthy text model must not stand between a clip and the renderer
     * that can actually produce one; and a pinned `provider:model` is still strict.
     * The one difference that matters is that a video call can legitimately run for
     * minutes, so the timeout belongs to the adapter and is not a routing concern.
     */
    generateVideo(request: RouteRequest & {
        prompt: string;
        aspectRatio?: string;
        durationSeconds?: number;
        image?: {
            mimeType: string;
            data: string;
        };
        withAudio?: boolean;
        signal?: AbortSignal;
        providerJobId?: AiVideoRequest['providerJobId'];
        onJobProgress?: AiVideoRequest['onJobProgress'];
    }): Promise<AiVideoResponse>;
    /**
     * Stream a request. Failover is only possible while nothing has been emitted
     * to the caller; once the first token is on the wire the stream is committed.
     */
    stream(request: RouteRequest & {
        input: string;
    }, signal?: AbortSignal): AsyncGenerator<AiStreamChunk>;
    private attachRouting;
}
export declare function scoreCandidate(candidate: RouteCandidate, mode: AiMode, successRate: number): number;
