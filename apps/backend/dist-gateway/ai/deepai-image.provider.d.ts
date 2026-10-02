import { AiCapability, AiImageRequest, AiImageResponse, AiProvider, AiProviderHealth, AiRequest, AiResponse } from './provider.types';
/** One DeepAI image is billed per call, which is a different currency to video seconds. */
export declare const DEEPAI_IMAGE_COST_PER_CALL = 1;
/**
 * DeepAI image generation, on the same optional `generateImage` method every other
 * image provider uses.
 *
 * There is no separate `ImageProvider` interface in this codebase: images are the
 * optional `generateImage()` on `AiProvider`, mirroring how `generateVideo()` works
 * for video. So this is a plain `AiProvider` that also happens to produce images,
 * registered only when `DEEPAI_ENABLED` is set, and it slots into the existing
 * router with no change to the media service, the UI or the failover chain.
 *
 * THE FREE TIER HERE IS NOT FREE, AND THIS IS THE PART TO READ.
 *
 * DeepAI's docs describe the image APIs as "included with DeepAI Pro", and the
 * per-call price for `text2img` is 1 credit per call -- which is money, drawn from
 * the same paid subscription that unlocks video. Unlike the video API there is no
 * monthly video allowance being drawn down, but there is no genuinely free tier
 * either: a key without an active Pro subscription is refused.
 *
 * So this provider is registered as opt-in and reports `unconfigured` without a key,
 * and the health detail says plainly that Pro is required. It is not offered as a
 * free fallback to Gemini or Pollinations, because it is not free.
 *
 * The endpoint answers with an `output_url` on DeepAI's CDN rather than bytes, so
 * the image is downloaded and returned inline, exactly as the Gemini image path
 * does. That URL is not stored or linked: ISOBASH keeps its own copy.
 */
export declare class DeepAiImageProvider implements AiProvider {
    readonly name = "deepai";
    readonly capabilities: readonly AiCapability[];
    readonly models: readonly string[];
    private readonly baseUrl;
    private readonly maxDownloadBytes;
    private get apiKey();
    health(): Promise<AiProviderHealth>;
    /** DeepAI images are generated; `execute` exists only to satisfy the AI interface. */
    execute(request: AiRequest): Promise<AiResponse>;
    /**
     * One `text2img` call produces one image.
     *
     * `count` is handled by the router as N separate calls, exactly as it is for every
     * other image provider, rather than by faking an N-image response from one call:
     * DeepAI bills per call, so four images cost four credits and a single call that
     * claimed four would be a lie.
     */
    generateImage(request: AiImageRequest): Promise<AiImageResponse>;
    /** A square by default, because `text2img` takes independent width and height. */
    private resolveEdge;
    private downloadImage;
    private requireKey;
    private requestJson;
}
