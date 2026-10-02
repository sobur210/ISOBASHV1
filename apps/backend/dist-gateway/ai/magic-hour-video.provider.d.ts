import { AiCapability, AiProvider, AiProviderHealth, AiRequest, AiResponse, AiVideoRequest, AiVideoResponse } from './provider.types';
import { CreateVideoJobParams, VideoJob, VideoProvider, ProviderCreditBalance } from './video-provider.types';
/**
 * Magic Hour video generation, as the first `VideoProvider` on the shared job
 * contract in `video-provider.types.ts`.
 *
 * MAGIC HOUR FREE TIER. This adapter is wired to a free account: one shared pool of
 * 400 credits per month across every ISOBASH user, output capped at 480p, and the
 * clip is watermarked by the provider. It is for building and testing the
 * integration, not for production output quality. The places that would change for
 * a paid provider are called out below; the interface itself does not change, so
 * adding Veo, Luma or a paid Magic Hour plan is a new file plus a registration line.
 *
 * Where the free tier is baked in, and how to lift it:
 *   - `MAGICHOUR_RESOLUTION` (default `480p`) and `MAGICHOUR_ALLOWED_MODELS` (default
 *     the two models the free plan can use). Raising both is all a paid plan needs.
 *   - `ProviderCreditService` is the shared-pool guard. It exists because this one
 *     account pays for every user; a paid plan with its own per-tenant billing would
 *     keep the service but stop consulting it, because there is no longer one pool.
 *
 * Nothing here fabricates a clip. If the project does not reach `complete`, or
 * `downloads` is empty, the call fails and the run records the provider's own
 * status and error verbatim.
 */
export declare class MagicHourVideoProvider implements AiProvider, VideoProvider {
    readonly name = "magic-hour";
    readonly capabilities: readonly AiCapability[];
    readonly models: readonly string[];
    private readonly baseUrl;
    private readonly resolution;
    private readonly allowedModels;
    private get apiKey();
    /** The model actually used when the caller does not pin one. */
    get defaultModel(): string;
    /**
     * Models this deployment will actually accept. The module registers exactly
     * these, so `/ai/capabilities` can never offer a model that `createJob` then
     * refuses -- the two are derived from the same list on purpose.
     */
    get enabledModels(): readonly string[];
    health(): Promise<AiProviderHealth>;
    /** Magic Hour renders video; `execute` exists only to satisfy the AI interface. */
    execute(request: AiRequest): Promise<AiResponse>;
    createJob(params: CreateVideoJobParams): Promise<VideoJob>;
    getJob(id: string): Promise<VideoJob>;
    cancelJob(id: string): Promise<void>;
    /**
     * Read the account's real balance.
     *
     * `/v1/account` is free -- it renders nothing -- so this is the one call worth
     * making before every submission: it is the only number that accounts for renders
     * started outside ISOBASH, which the local ledger structurally cannot see.
     *
     * A failure is reported as `readable: false` rather than thrown. Throwing would
     * mean a network blip looked identical to "the pool is fine", and the caller's
     * only correct response to an unknown balance is to stop.
     */
    readCreditBalance(): Promise<ProviderCreditBalance>;
    downloadResult(job: VideoJob): Promise<{
        mimeType: string;
        data: string;
    }>;
    generateVideo(request: AiVideoRequest): Promise<AiVideoResponse>;
    /**
     * Poll until the project reaches a terminal status.
     *
     * Polling, not webhooks, is the primary path here. Magic Hour's webhooks need a
     * publicly reachable URL, which a local install does not have, and a `canceled`
     * project emits no webhook at all (the docs say so), so a webhook-only
     * implementation would silently hang on cancellation. The job primitives above
     * are what a webhook handler would drive instead, so adding one later does not
     * change this loop's shape.
     */
    private waitForCompletion;
    /**
     * Hand the provider's own view of the render to the caller.
     *
     * A failure to report must not fail the render: the caller is being told about a
     * job that already exists and is already paid for, so turning a reporting problem
     * into a failed render would waste credits that have been committed.
     */
    private report;
    private requireKey;
    private resolveModel;
    private uploadFirstFrame;
    private requestJson;
    /**
     * Normalise both shapes onto one `VideoJob`.
     *
     * The create response is only `{ id, credits_charged }`, so it is mapped with
     * `isCreate` and the status is left `unknown` rather than inventing a `queued`
     * the provider never said. The details response carries the real status, the
     * dimensions, the error and the downloads.
     */
    private toJob;
}
