/**
 * DeepAI cost and limit facts, transcribed from the published documentation.
 *
 *   https://deepai.org/docs  (Video API)
 *   https://deepai.org/apis   (image APIs)
 *
 * DEEPAI FREE TIER -- READ THIS BEFORE ENABLING THE ADAPTER.
 *
 * DeepAI video is **not available without a paid DeepAI Pro subscription**. The docs
 * are explicit that the video generator is "exclusively available to DeepAI Pro
 * members", and a `403` on submission means the account has no active Pro
 * subscription. An API key on its own is therefore NOT enough to render a clip: the
 * key must belong to an account with Pro active, which costs money every month.
 *
 * What Pro includes, monthly, per the pricing page:
 *
 *   - 25 seconds of standard ("hd") video generation per month.
 *   - 8 seconds of Hollywood Mode ("2K cinematic with audio") per month.
 *   - Anything beyond that comes out of a prepaid wallet at $0.20 per standard
 *     second and $0.30 per Hollywood second. Without auto top-up, an exhausted
 *     allowance surfaces as a `402` rather than a surprise bill.
 *
 * So the real testing headroom on a fresh Pro account is about **five 5-second
 * standard clips** (or **one 8-second Hollywood clip**), and not a second of
 * anything else until the month rolls over. That figure is per account, shared by
 * every ISOBASH user, exactly like Magic Hour's 400-credit pool.
 *
 * The two allowances are separate pools and are tracked separately, because a clip
 * drawn from the 8 Hollywood seconds must not be recorded as if it came from the 25
 * standard ones. A mode change therefore changes which pool is at risk, which is
 * why `DeepAiVideoCost` keeps them apart rather than reporting one "remaining".
 *
 * Durations are integral and constrained to 5-15 seconds. There is no 4-second clip
 * and no 30-second one, so a caller asking for a length DeepAI cannot produce is
 * told so rather than silently given a different length -- a render that is not the
 * one asked for is a different product.
 */
export declare const DEEPAI_VIDEO_MIN_SECONDS = 5;
export declare const DEEPAI_VIDEO_MAX_SECONDS = 15;
/**
 * Monthly allowances included in DeepAI Pro, in seconds, per mode.
 *
 * The wallet price is what a render costs once the allowance is gone. It is the
 * number that decides whether a request should be submitted at all when the
 * allowance is exhausted and auto top-up is off.
 */
export declare const DEEPAI_VIDEO_QUEUES: Record<DeepAiVideoMode, DeepAiVideoQueue>;
export type DeepAiVideoMode = 'hd' | 'hollywood';
/**
 * `shape` values the API accepts. `auto` is the honest default: on image-to-video
 * it matches the source image, and on text-to-video it means landscape.
 */
export declare const DEEPAI_VIDEO_SHAPES: readonly ["auto", "square", "landscape", "standard", "vertical", "portrait"];
export type DeepAiVideoShape = (typeof DEEPAI_VIDEO_SHAPES)[number];
export type DeepAiVideoQueue = {
    mode: DeepAiVideoMode;
    label: string;
    freeSecondsPerMonth: number;
    walletDollarsPerSecond: number;
};
export type DeepAiVideoCost = {
    mode: DeepAiVideoMode;
    seconds: number;
    /** Seconds this render draws from the monthly allowance. */
    allowanceSeconds: number;
    /** Dollars from the wallet if the allowance cannot cover it. Zero when it can. */
    walletDollars: number;
    /** The pool this render is billed against. The two modes never share one. */
    queue: DeepAiVideoQueue;
};
/** The model id ISOBASH registers, so the router and UI have something to route to. */
export declare const DEEPAI_VIDEO_MODEL = "deepai-video";
export declare function isDeepAiVideoMode(value: unknown): value is DeepAiVideoMode;
/** The model ISOBASH accepts for image generation, an endpoint name rather than a version. */
export declare const DEEPAI_IMAGE_MODEL = "text2img";
/** DeepAI rejects prompts past 3000 characters at submission. */
export declare const DEEPAI_MAX_PROMPT_CHARS = 3000;
/** First frames are capped at 20MB by the docs. */
export declare const DEEPAI_MAX_SOURCE_IMAGE_BYTES: number;
/**
 * Clamp a requested length to what DeepAI can actually render.
 *
 * Returns null when the request cannot be served at all rather than snapping to a
 * nearby length, so a caller asking for a 4 second clip is refused by
 * `resolveDuration` in the adapter with an honest message. Used only for the
 * allowance arithmetic, where the assumption is that the adapter already checked.
 */
export declare function clampDeepAiSeconds(seconds: number): number;
/**
 * What a render costs against its own pool.
 *
 * `allowanceSeconds` is the number that matters for the guard: it is what the
 * shared monthly pool loses. The wallet figure is only nonzero once the allowance
 * is gone, and callers refuse the request in that case rather than discovering it
 * as a `402` after the user has waited.
 */
export declare function estimateDeepAiVideoCost(params: {
    mode: DeepAiVideoMode;
    seconds: number;
}): DeepAiVideoCost;
/**
 * Seconds a mode's monthly pool still holds after `spent` seconds of render.
 *
 * Negative means the pool is already overdrawn, which the guard treats as "stop"
 * rather than clamping to zero and pretending there is room.
 */
export declare function deepAiRemainingSeconds(params: {
    mode: DeepAiVideoMode;
    spentSeconds: number;
}): number;
