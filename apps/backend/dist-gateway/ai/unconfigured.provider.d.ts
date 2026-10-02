import { AiProvider, AiProviderHealth, AiRequest, AiResponse } from './provider.types';
export declare class UnconfiguredAiProvider implements AiProvider {
    readonly name = "unconfigured";
    readonly capabilities: readonly ["language", "vision", "embeddings", "image-generation", "video-generation", "research"];
    health(): Promise<AiProviderHealth>;
    execute(_request: AiRequest): Promise<AiResponse>;
}
