import { AiCapability, AiProvider, AiProviderHealth, AiRequest, AiResponse, AiVideoRequest, AiVideoResponse } from './provider.types';
/**
 * Pollinations video generation (`GET /video/{prompt}`, MP4 out).
 *
 * This is a separate provider from the key-less image one on purpose. Pollinations
 * now requires an API key on every generation endpoint, so video cannot share the
 * anonymous image adapter: registering a video capability against a provider that
 * would answer every call with 401 would make `capabilities.video.available` a
 * claim ISOBASH cannot keep.
 *
 * Everything is opt-in (`POLLINATIONS_VIDEO_ENABLED`) and the base URL is
 * overridable, so the adapter can be exercised against a fixture without editing
 * the code path. Nothing here fabricates a clip: if the endpoint does not return
 * video bytes, the call fails and the run records the provider's own status.
 */
export declare class PollinationsVideoProvider implements AiProvider {
    readonly name = "pollinations-video";
    readonly capabilities: readonly AiCapability[];
    private readonly baseUrl;
    private readonly model;
    private get apiKey();
    health(): Promise<AiProviderHealth>;
    /** This endpoint only renders video; the interface requires `execute`, so the answer is an explicit refusal. */
    execute(request: AiRequest): Promise<AiResponse>;
    generateVideo(request: AiVideoRequest): Promise<AiVideoResponse>;
    private uploadFirstFrame;
}
