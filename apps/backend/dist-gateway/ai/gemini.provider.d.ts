import { AiCapability, AiEmbeddingRequest, AiEmbeddingResponse, AiImageRequest, AiImageResponse, AiProvider, AiProviderHealth, AiRequest, AiResponse, AiStreamChunk } from './provider.types';
export declare class GeminiProvider implements AiProvider {
    readonly name = "gemini";
    /**
     * Image generation is opt-out rather than implicit: a deployment that only
     * wants Gemini for text and embeddings sets `GEMINI_IMAGE_ENABLED=false` and the
     * capability disappears from `/ai/capabilities` instead of being offered and
     * then refused at call time.
     */
    private readonly imageEnabled;
    readonly capabilities: readonly AiCapability[];
    private readonly model;
    private readonly embeddingModel;
    private readonly imageModel;
    private modelCheck;
    private healthCache;
    /**
     * Confirm the configured model can actually generate for this key.
     *
     * `GET /models/{model}` still answers 200 for models that are listed but no
     * longer served to new keys, so metadata is not proof. A real generation is the
     * only honest signal, and it is cached for 10 minutes so the admin health
     * panel (which polls every 10s) does not burn quota.
     *
     * Two things make this more than a "did it return 200" check:
     *
     * The budget must be large enough to actually yield text. The 3.x Flash line is
     * a thinking model: it spends the output budget on `thoughtsTokenCount` first
     * and returns a 200 with `finishReason: MAX_TOKENS` and **zero** text parts
     * when the cap is too small to reach an answer. A probe asking for one token
     * therefore passes on a model that cannot complete a one-word reply, which is
     * the opposite of what this function exists to detect.
     *
     * And the response body must contain text, because that 200-with-no-parts is
     * indistinguishable from success if the body is not read.
     */
    private verifyConfiguredModel;
    health(): Promise<AiProviderHealth>;
    private computeHealth;
    execute(request: AiRequest): Promise<AiResponse>;
    stream(request: AiRequest, signal?: AbortSignal): AsyncIterable<AiStreamChunk>;
    /**
     * `:embedContent` takes one input per call, so a batch is sent as a short
     * sequential run. Rate limits and overload are surfaced verbatim: an index
     * must never be built from a silently half-embedded document.
     */
    embed(request: AiEmbeddingRequest): Promise<AiEmbeddingResponse>;
    /**
     * Phase 13 image generation.
     *
     * Gemini renders one image per `:generateContent` call, so `count` is driven as
     * a short sequential run. Three rules keep the result honest:
     *  - a call that fails is recorded in `failures` with the provider's own code and
     *    message, so "1 of 3 images" is never reported as "3 images";
     *  - a run where nothing was produced throws the first real provider error, so a
     *    quota refusal or a bad key cannot be mistaken for an empty gallery;
     *  - a refusal (`promptFeedback.blockReason`, `IMAGE_SAFETY`, …) is returned
     *    rather than thrown, because the provider answered on purpose and the caller
     *    should record a block, not an outage.
     */
    generateImage(request: AiImageRequest): Promise<AiImageResponse>;
    private assertLanguageCapability;
    private requireApiKey;
}
