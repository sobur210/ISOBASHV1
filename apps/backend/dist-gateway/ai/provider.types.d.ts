export type AiCapability = 'language' | 'vision' | 'embeddings' | 'image-generation' | 'video-generation' | 'research';
export type AiMode = 'online' | 'offline' | 'hybrid';
export type AiRequest = {
    capability: AiCapability;
    input: string;
    model?: string;
    mode?: AiMode;
    metadata?: Record<string, string>;
    /**
     * Phase 10: request a machine-readable JSON object when the provider supports
     * it (Ollama `format: json`, Gemini `responseMimeType`, OpenAI
     * `response_format`). This is what makes agent planning and tool calling real
     * instead of a model output being regex-scraped for JSON.
     */
    responseFormat?: 'text' | 'json';
};
export type AiResponse = {
    provider: string;
    model: string;
    capability: AiCapability;
    output: string;
    usage?: {
        inputTokens?: number;
        outputTokens?: number;
    };
};
export type AiProviderHealth = {
    provider: string;
    status: 'healthy' | 'unconfigured' | 'unavailable';
    capabilities: AiCapability[];
    detail?: string;
};
export type AiStreamChunk = {
    type: 'delta';
    text: string;
} | {
    type: 'done';
    provider: string;
    model: string;
    usage?: {
        inputTokens?: number;
        outputTokens?: number;
    };
} | {
    type: 'error';
    code: string;
    message: string;
};
/**
 * Phase 12: embedding requests. Batched because indexing a document means
 * hundreds of chunks, and one HTTP round trip per chunk is the difference
 * between a usable index and a slow one.
 */
export type AiEmbeddingRequest = {
    inputs: string[];
    model?: string;
    /**
     * `RETRIEVAL_DOCUMENT` for the text being stored and `RETRIEVAL_QUERY` for
     * a search query. Providers that do not support task types ignore it.
     */
    taskType?: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY';
};
export type AiEmbeddingResponse = {
    provider: string;
    model: string;
    embeddings: number[][];
    dimensions: number;
};
/**
 * Phase 13 image generation.
 *
 * `count` is what the caller asked for, not a promise: providers that only render
 * one image per call are driven repeatedly by the adapter, and anything that could
 * not be produced is reported in `failures` rather than quietly dropped.
 */
export type AiImageRequest = {
    prompt: string;
    model?: string;
    /** Aspect ratio such as `16:9`, validated against `MEDIA_ASPECT_RATIOS`. */
    aspectRatio?: string;
    count?: number;
};
export type AiGeneratedImage = {
    mimeType: string;
    /** Base64 payload exactly as the provider returned it. */
    data: string;
    /** The provider's own note about the image, when it returned one. */
    note?: string;
};
export type AiImageResponse = {
    provider: string;
    model: string;
    images: AiGeneratedImage[];
    /** How many images the request asked for. */
    requested: number;
    /**
     * Provider finish reasons that mean the provider refused rather than failed.
     * `IMAGE_SAFETY` and `PROHIBITED_CONTENT` are the provider's own verdict, not a
     * moderation classifier ISOBASH runs, and are reported as such.
     */
    finishReason?: string;
    /** Per-image errors for the calls that did not produce bytes. */
    failures?: {
        code: string;
        message: string;
    }[];
    /**
     * Providers the router tried and had to leave, and why. Present so a run that
     * succeeded on a second renderer says so out loud instead of quietly showing
     * an image the user believes came from the model they picked.
     */
    failovers?: string[];
    usage?: {
        inputTokens?: number;
        outputTokens?: number;
    };
};
/**
 * Phase 14 video generation.
 *
 * One request produces one clip. Video models render a single sequence per call,
 * so a `count` on the API surface would be N sequential provider calls rather than
 * one call with a multiplier, and asking for four at once has no business being
 * the default.
 *
 * The first-frame image is carried **inline** rather than as a URL. ISOBASH's
 * stored assets are session-authenticated and deliberately unreachable without a
 * cookie, so handing a provider a link to one of our own bytes would mean
 * publishing the user's image; an adapter that needs a public URL has to upload
 * the bytes itself and say so.
 */
export type AiVideoRequest = {
    prompt: string;
    model?: string;
    /** Aspect ratio such as `16:9`, validated against `MEDIA_VIDEO_ASPECT_RATIOS`. */
    aspectRatio?: string;
    /** Clip length in whole seconds, validated against `MEDIA_VIDEO_DURATIONS`. */
    durationSeconds?: number;
    /** The first frame for an image-to-video run. */
    image?: {
        mimeType: string;
        data: string;
    };
    /** Ask for an audio track. Providers whose models always carry audio ignore it. */
    withAudio?: boolean;
    /**
     * Abort the render.
     *
     * Added with Magic Hour, whose renders run for minutes rather than seconds. An
     * adapter that can be interrupted between provider calls -- polling a project
     * status, say -- should stop as soon as this fires and leave the provider's own
     * project untouched to finish or expire on its side. Adapters whose protocol
     * offers no in-flight abort ignore it, and cancelling a clip that is already
     * rendering is best effort rather than guaranteed.
     */
    signal?: AbortSignal;
    /**
     * Continue a render that was already submitted, instead of creating a new one.
     *
     * Added with queued execution. A queued job can outlive the process that started
     * it: the worker dies, the job is retried later, and the provider is still
     * rendering the original. Without this, the retry would submit a *second* project
     * for the same clip, and on a metered provider that is paying twice for one
     * render. With it, the retry polls the project that already exists and the clip
     * is billed once.
     *
     * Adapters that cannot look a project back up ignore it and create a new one, so
     * this is an optimisation of correctness for async providers, not a requirement
     * of the contract.
     */
    providerJobId?: string;
    /**
     * Told about the provider's own view of the render as it changes.
     *
     * Reported when the project is created and on every poll, so a caller can persist
     * the provider's id the moment it exists rather than after a multi-minute wait.
     * That is what makes the retry path above possible, and it is also where realtime
     * progress comes from: the adapter never invents a percentage, so a provider that
     * reports none simply produces no updates.
     *
     * Must not throw; a reporting failure must not fail the render.
     */
    onJobProgress?: (job: {
        id: string;
        status: string;
        progressPercent: number | null;
    }) => void;
};
export type AiGeneratedVideo = {
    mimeType: string;
    /** Base64 payload exactly as the provider returned it. */
    data: string;
    /** The provider's own note about the clip, when it returned one. */
    note?: string;
};
export type AiVideoResponse = {
    provider: string;
    model: string;
    video: AiGeneratedVideo;
    /** Length in seconds the request asked for. */
    requestedSeconds: number;
    /**
     * Provider finish reasons that mean the provider refused rather than failed.
     * Reported as the provider's verdict, not as a filter ISOBASH ran.
     */
    finishReason?: string;
    /**
     * Present when the provider meters the render, so the caller can settle what it
     * actually cost.
     *
     * This carries the provider's own numbers rather than an ISOBASH calculation,
     * because only the provider knows what it finally charged: it quotes an estimate
     * up front, revises it once the real output frame rate is known, and refunds a
     * failed render. An adapter that is not billed simply omits this.
     */
    metering?: {
        /** The provider's own id for the render, kept so it can be traced and reconciled. */
        providerProjectId: string | null;
        /** What the provider says it cost, or null when it never said. */
        creditsCharged: number | null;
        /** True when the figure above is still the provider's opening estimate. */
        creditsChargedIsEstimate: boolean;
    };
    /**
     * Providers the router tried and had to leave, and why. Same rule as images:
     * a clip produced by a second renderer must never be passed off as the one the
     * caller pinned.
     */
    failovers?: string[];
    usage?: {
        inputTokens?: number;
        outputTokens?: number;
    };
};
/** Finish reasons a provider uses to say "I will not produce this", not "I failed". */
export declare const PROVIDER_REFUSAL_REASONS: Set<string>;
export declare function isProviderRefusal(finishReason?: string): boolean;
export interface AiProvider {
    readonly name: string;
    readonly capabilities: readonly AiCapability[];
    health(): Promise<AiProviderHealth>;
    execute(request: AiRequest): Promise<AiResponse>;
    /** Present only when the provider can really produce vectors. */
    embed?(request: AiEmbeddingRequest): Promise<AiEmbeddingResponse>;
    /** Present only when the provider can really produce image bytes. */
    generateImage?(request: AiImageRequest): Promise<AiImageResponse>;
    /** Present only when the provider can really produce video bytes. */
    generateVideo?(request: AiVideoRequest): Promise<AiVideoResponse>;
    stream?(request: AiRequest, signal?: AbortSignal): AsyncIterable<AiStreamChunk>;
}
export declare class AiProviderError extends Error {
    readonly provider: string;
    readonly code: string;
    /**
     * Machine-readable context a caller needs to act correctly, kept off the
     * message so it is not shown to a user.
     *
     * This exists for the billing case: a render can fail *after* the provider
     * accepted it, and then the provider's own project id is the only evidence that
     * credits may have been spent. Without it a failed render is indistinguishable
     * from one that was refused before submission, and the credit ledger has to
     * guess which it was.
     */
    readonly details?: Record<string, unknown> | undefined;
    constructor(message: string, provider: string, code: string, 
    /**
     * Machine-readable context a caller needs to act correctly, kept off the
     * message so it is not shown to a user.
     *
     * This exists for the billing case: a render can fail *after* the provider
     * accepted it, and then the provider's own project id is the only evidence that
     * credits may have been spent. Without it a failed render is indistinguishable
     * from one that was refused before submission, and the credit ledger has to
     * guess which it was.
     */
    details?: Record<string, unknown> | undefined);
    /** The provider's own id for the work, when the error happened after it started. */
    get providerProjectId(): string | null;
}
