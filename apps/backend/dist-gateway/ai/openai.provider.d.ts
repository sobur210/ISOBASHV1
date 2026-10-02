import { AiCapability, AiEmbeddingRequest, AiEmbeddingResponse, AiImageRequest, AiImageResponse, AiProvider, AiProviderHealth, AiRequest, AiResponse } from './provider.types';
export declare class OpenAiProvider implements AiProvider {
    readonly name = "openai";
    /** Image generation is opt-out, exactly like Gemini's: a deployment that only
     * wants chat and embeddings sets `OPENAI_IMAGE_ENABLED=false`. */
    private readonly imageEnabled;
    readonly capabilities: readonly AiCapability[];
    private readonly baseUrl;
    private readonly model;
    private readonly embeddingModel;
    private readonly imageModel;
    /** Hard ceiling so a bad `count` cannot turn one request into an unbounded spend. */
    private readonly maxImagesPerCall;
    health(): Promise<AiProviderHealth>;
    execute(request: AiRequest): Promise<AiResponse>;
    embed(request: AiEmbeddingRequest): Promise<AiEmbeddingResponse>;
    generateImage(request: AiImageRequest): Promise<AiImageResponse>;
}
