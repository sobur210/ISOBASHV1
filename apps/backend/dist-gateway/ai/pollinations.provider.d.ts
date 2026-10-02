import { AiCapability, AiImageRequest, AiImageResponse, AiProvider, AiProviderHealth, AiRequest, AiResponse } from './provider.types';
export declare class PollinationsProvider implements AiProvider {
    readonly name = "pollinations";
    readonly capabilities: readonly AiCapability[];
    private readonly baseUrl;
    private readonly model;
    private get apiKey();
    /**
     * No key is needed, so there is nothing to be unconfigured about; `health()`
     * reports readiness and the truth about connectivity is established by the first
     * real render, which is exactly how a call-time failure is reported.
     */
    health(): Promise<AiProviderHealth>;
    /**
     * This endpoint only renders images. The interface requires `execute`, so the
     * answer is an explicit refusal naming the real capability rather than a method
     * that quietly claims to handle text.
     */
    execute(request: AiRequest): Promise<AiResponse>;
    generateImage(request: AiImageRequest): Promise<AiImageResponse>;
}
