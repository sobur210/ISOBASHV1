import { AiCapability, AiEmbeddingRequest, AiEmbeddingResponse, AiProvider, AiProviderHealth, AiRequest, AiResponse, AiStreamChunk } from './provider.types';
export declare class OllamaProvider implements AiProvider {
    readonly name = "ollama";
    readonly capabilities: readonly AiCapability[];
    private readonly baseUrl;
    private readonly model;
    private readonly embeddingModel;
    health(): Promise<AiProviderHealth>;
    /** True when the local embedding model is actually installed. */
    embeddingModelAvailable(): Promise<boolean>;
    execute(request: AiRequest): Promise<AiResponse>;
    /**
     * `POST /api/embed` takes the whole batch, which is what makes indexing a
     * document tolerable. A missing model is reported as such instead of being
     * retried against another vendor.
     */
    embed(request: AiEmbeddingRequest): Promise<AiEmbeddingResponse>;
    stream(request: AiRequest, signal?: AbortSignal): AsyncIterable<AiStreamChunk>;
}
