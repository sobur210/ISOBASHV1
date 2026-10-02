import { AiCapability, AiProvider, AiProviderHealth, AiRequest, AiResponse, AiVideoRequest, AiVideoResponse } from './provider.types';
import { CreateVideoJobParams, VideoJob, VideoProvider, ProviderCreditBalance } from './video-provider.types';
/**
 * DeepAI video generation, on the same job contract as Magic Hour.
 *
 * WHERE THIS STANDS. The adapter is complete and honest about its limits, but it
 * cannot produce a clip from a bare API key: DeepAI video requires an active paid
 * Pro subscription, and a key without one is answered with `403`. See
 * `deepai.pricing.ts` for the full free-tier arithmetic -- 25 standard seconds and
 * 8 Hollywood seconds per month, which is roughly five 5-second clips.
 *
 * The API is the same shape as Magic Hour's, so most of this file is a parallel
 * implementation rather than a different idea: submit a job, get an opaque id back,
 * poll a status endpoint until it reaches a terminal state, then download the
 * result while the link is still alive. What differs:
 *
 *   - Authentication is a bare `api-key` header, not `Authorization: Bearer`.
 *   - Input is `multipart/form-data` (or form-urlencoded, or JSON with a URL), so a
 *     first frame is sent as a file part.
 *   - `403` means "no Pro subscription", which is a configuration problem rather
 *     than a bad key, and gets its own message so nobody goes hunting for a typo.
 *   - A finished result is only retrievable for an hour, which is why the download
 *     is part of `generateVideo` and never a link ISOBASH stores.
 *
 * Nothing here fabricates a clip. A job that does not reach `complete` fails with
 * DeepAI's own reason attached.
 */
export declare class DeepAiVideoProvider implements AiProvider, VideoProvider {
    readonly name = "deepai";
    readonly capabilities: readonly AiCapability[];
    readonly models: readonly string[];
    private readonly baseUrl;
    private get apiKey();
    get defaultModel(): string;
    health(): Promise<AiProviderHealth>;
    /** DeepAI video renders video; `execute` exists only to satisfy the AI interface. */
    execute(request: AiRequest): Promise<AiResponse>;
    createJob(params: CreateVideoJobParams): Promise<VideoJob>;
    getJob(id: string): Promise<VideoJob>;
    /**
     * DeepAI publishes no cancel endpoint, so this is deliberately absent.
     *
     * The interface treats the method as optional precisely for this case: inventing
     * a DELETE that does not exist would produce a confident 404 on every call. A
     * cancelled ISOBASH run simply stops waiting, and the job finishes or expires on
     * DeepAI's side -- which the run's note says out loud, because a clip that
     * finishes after ISOBASH gave up is still billed.
     */
    /**
     * DeepAI's documented remaining allowance, in seconds.
     *
     * There is no balance endpoint on the video API, so this reports the allowance
     * ISOBASH has accounted for rather than one DeepAI read back. That is a weaker
     * guarantee than Magic Hour's, and deliberately reported as such: `readable` is
     * true only for the figures the pricing table gives with certainty, and the
     * caller is told the accounting is local in `tier`. Renders started outside
     * ISOBASH, or before a reinstall, are invisible here -- so this number is a
     * display figure, not a guard, and the real protection is the per-pool monthly
     * ceiling still to be built.
     */
    readCreditBalance(): Promise<ProviderCreditBalance>;
    downloadResult(job: VideoJob): Promise<{
        mimeType: string;
        data: string;
    }>;
    generateVideo(request: AiVideoRequest): Promise<AiVideoResponse>;
    private waitForCompletion;
    /**
     * Hollywood Mode when audio is asked for, standard otherwise.
     *
     * DeepAI has no separate audio switch: audio arrives with Hollywood Mode, so a
     * request for audio and a request for 2K are the same request. A caller that
     * pinned a mode and also asked for audio gets the pinned mode, and is told that
     * audio is only carried by Hollywood rather than being silently upgraded -- a
     * silent upgrade would spend the 8-second pool on a 25-second one.
     */
    private resolveMode;
    /**
     * Refuse a length DeepAI cannot render rather than snapping to a neighbour.
     *
     * `MediaService` validates against `MEDIA_VIDEO_DURATIONS`, which is a
     * deployment-wide list shared with providers that accept 4 seconds. Clamping
     * here would answer a 4-second request with a 5-second clip that the user paid
     * for a second they did not ask to spend.
     */
    private resolveDuration;
    /**
     * Map the shared aspect ratios onto DeepAI's `shape`, or use `auto`.
     *
     * The docs require `auto` for Hollywood image-to-video, because in that mode
     * DeepAI always keeps the source image's shape and rejects an explicit one.
     */
    private resolveShape;
    private requireKey;
    private toBlob;
    /**
     * Map DeepAI's `{ id, status }` and `{ status, output_url, error }` onto one job.
     *
     * DeepAI reports `processing` while it works and `completed` / `failed` at the
     * end, so `processing` becomes `rendering` and the two terminal states become
     * `complete` and `error`. The create response carries no status at all, so it is
     * recorded as `unknown` rather than inventing a `queued` DeepAI never said.
     */
    private toJob;
    private requestJson;
}
