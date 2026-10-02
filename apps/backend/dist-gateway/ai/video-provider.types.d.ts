/**
 * Job-oriented video provider contract.
 *
 * Why this exists next to `AiProvider.generateVideo()`: the Phase 14 provider
 * contract answers with video bytes inline, which is the right shape for a
 * provider that renders synchronously. Magic Hour is asynchronous -- it returns a
 * project id, renders in the background, and only then exposes a download URL.
 * Modelling that as "generateVideo" that happens to block for four minutes would
 * hide the job, its status, and its credit estimate behind one call.
 *
 * So a video provider gets two layers:
 *
 *   1. the job primitives below -- `createJob`, `getJob`, `downloadResult`, and
 *      optionally `cancelJob`. These are the honest shape of an async renderer and
 *      are what a webhook or a resume-after-restart path is built on.
 *   2. `generateVideo()`, already on `AiProvider`, which composes those primitives
 *      into the blocking inline-bytes answer the router, the media service and the
 *      storage layer already consume.
 *
 * The second layer is the default and the one callers use, so adding Veo, Luma or
 * a second Magic Hour model is a new file implementing this interface plus one
 * registration line. Nothing in the router, the media service or the UI changes.
 */
import { AiVideoRequest, AiVideoResponse } from './provider.types';
export type { AiVideoRequest, AiVideoResponse } from './provider.types';
/** Statuses a provider reports for one render. */
export type VideoJobStatus = 'queued' | 'rendering' | 'complete' | 'error' | 'canceled' | 'draft' | 'unknown';
export type VideoJobError = {
    /** The provider's own machine-readable code, kept verbatim. */
    code: string;
    /** The provider's own message, kept verbatim. */
    message: string;
};
export type VideoDownload = {
    url: string;
    /** When the link stops working. Always stored and surfaced: it is why we download. */
    expiresAt: string | null;
};
export type VideoJob = {
    /** The provider's own id, opaque to ISOBASH. */
    id: string;
    status: VideoJobStatus;
    /**
     * Credits the provider says this job cost.
     *
     * On a job that has not finished this is an *estimate* and the provider revises
     * it once the real output frame rate is known. Callers must not treat a first
     * value as final, and a failure is refunded, so a terminal error is allowed to
     * report a smaller number than an earlier estimate.
     */
    creditsCharged: number | null;
    creditsChargedIsEstimate: boolean;
    width: number | null;
    height: number | null;
    /** Length the provider reports for the finished output, when it reports one. */
    durationSeconds: number | null;
    /**
     * How far along this render is, 0-100, when the provider says.
     *
     * Null is a real answer meaning "this provider reports no progress", not a missing
     * value: a UI that shows a spinner is being honest about what it knows, and one
     * that showed 40% because it counted polls would be inventing a fact about someone
     * else's GPU.
     */
    progressPercent: number | null;
    error: VideoJobError | null;
    downloads: VideoDownload[];
    /** The provider's own project type, e.g. `TEXT_TO_VIDEO`. */
    type: string | null;
};
/**
 * What a metered provider says about the account it bills.
 *
 * This is a *shared* balance, not a per-caller one. It is reported separately from
 * the budget arithmetic in `ProviderCreditService` because the provider's number is
 * the authority and a local estimate is only ever a fallback: a local ledger is
 * blind to renders started outside ISOBASH, and to anything spent before a
 * reinstall.
 */
export type ProviderCreditBalance = {
    /** Credits the provider says are available to spend right now. */
    balance: number;
    /** Plan tier, when the provider names one, e.g. `free`. */
    tier?: string;
    /**
     * When the balance is undefined the provider meters credits but did not report a
     * figure, so no reservation may be made against an unknown balance.
     */
    readable: boolean;
};
export type CreateVideoJobParams = {
    prompt: string;
    /** Provider-native model id. Left undefined the provider picks its default. */
    model?: string;
    aspectRatio?: string;
    durationSeconds?: number;
    withAudio?: boolean;
    /**
     * The first frame, already fetched out of ISOBASH storage as bytes.
     *
     * A provider that needs a URL for this must be given the bytes and left to
     * upload them itself, because ISOBASH's own asset route is session
     * authenticated by design and must never be made public to make a render work.
     */
    image?: {
        mimeType: string;
        data: string;
    };
};
/**
 * A provider that can render video.
 *
 * `generateVideo` is required so an implementation cannot be registered without a
 * way to actually produce bytes: the media service has no other entry point, and a
 * provider that only implemented the job primitives would be registered as a video
 * provider and then fail at render time.
 */
export interface VideoProvider {
    readonly name: string;
    /** Model ids this provider accepts, for the UI and for validation. */
    readonly models: readonly string[];
    /** Create a render and return it immediately, before anything has rendered. */
    createJob(params: CreateVideoJobParams): Promise<VideoJob>;
    /** Read the current state of a render. */
    getJob(id: string): Promise<VideoJob>;
    /**
     * Fetch the finished clip. Providers whose `downloads[].url` expires must be
     * downloaded here, never linked: ISOBASH stores its own copy.
     */
    downloadResult(job: VideoJob): Promise<{
        mimeType: string;
        data: string;
    }>;
    /** Best-effort cancellation. Providers without it simply omit the method. */
    cancelJob?(id: string): Promise<void>;
    /**
     * Read the provider's own remaining credit balance.
     *
     * Present only on providers that meter a shared pool. `readable: false` is a
     * real answer meaning "this provider meters credits but would not tell us the
     * figure", and it is deliberately not the same as omitting the method: a missing
     * method means there is no pool, while an unreadable one means the pool exists and
     * its size is unknown, which is the state in which spending must stop.
     */
    readCreditBalance?(): Promise<ProviderCreditBalance>;
    /**
     * Blocking composition of the three above into the Phase 14 contract. The
     * default implementation polls; a provider that gets pushed-to-completion by a
     * webhook can override it to wait on an event instead.
     */
    generateVideo(request: AiVideoRequest): Promise<AiVideoResponse>;
}
