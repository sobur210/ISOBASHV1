"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenAiProvider = void 0;
const common_1 = require("@nestjs/common");
const provider_types_1 = require("./provider.types");
/** `1:1`-style ratios become the sizes the images API actually accepts. */
const IMAGE_SIZE_BY_RATIO = {
    '1:1': '1024x1024',
    '3:4': '1024x1536',
    '4:3': '1536x1024',
    '9:16': '1024x1536',
    '16:9': '1536x1024',
};
let OpenAiProvider = class OpenAiProvider {
    name = 'openai';
    /** Image generation is opt-out, exactly like Gemini's: a deployment that only
     * wants chat and embeddings sets `OPENAI_IMAGE_ENABLED=false`. */
    imageEnabled = process.env.OPENAI_IMAGE_ENABLED !== 'false';
    capabilities = this.imageEnabled
        ? ['language', 'embeddings', 'image-generation']
        : ['language', 'embeddings'];
    baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    embeddingModel = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
    imageModel = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';
    /** Hard ceiling so a bad `count` cannot turn one request into an unbounded spend. */
    maxImagesPerCall = 8;
    async health() {
        if (!process.env.OPENAI_API_KEY) {
            return {
                provider: this.name,
                status: 'unconfigured',
                capabilities: [...this.capabilities],
                detail: 'OPENAI_API_KEY is not configured.',
            };
        }
        return {
            provider: this.name,
            status: 'healthy',
            capabilities: [...this.capabilities],
            detail: 'Cloud provider credentials are configured; connectivity is checked on execution.',
        };
    }
    async execute(request) {
        if (request.capability !== 'language') {
            throw new provider_types_1.AiProviderError(`OpenAI does not support ${request.capability}.`, this.name, 'CAPABILITY_UNSUPPORTED');
        }
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new provider_types_1.AiProviderError('OPENAI_API_KEY is required for cloud execution.', this.name, 'PROVIDER_NOT_CONFIGURED');
        }
        try {
            const response = await fetch(`${this.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
                body: JSON.stringify({
                    model: request.model || this.model,
                    messages: [{ role: 'user', content: request.input }],
                    ...(request.responseFormat === 'json' ? { response_format: { type: 'json_object' } } : {}),
                }),
            });
            if (!response.ok) {
                throw new provider_types_1.AiProviderError(`OpenAI returned HTTP ${response.status}.`, this.name, 'PROVIDER_REQUEST_FAILED');
            }
            const payload = (await response.json());
            const output = payload.choices?.[0]?.message?.content;
            if (!output) {
                throw new provider_types_1.AiProviderError('OpenAI returned no response text.', this.name, 'EMPTY_PROVIDER_RESPONSE');
            }
            return {
                provider: this.name,
                model: payload.model || request.model || this.model,
                capability: request.capability,
                output,
                usage: { inputTokens: payload.usage?.prompt_tokens, outputTokens: payload.usage?.completion_tokens },
            };
        }
        catch (error) {
            if (error instanceof provider_types_1.AiProviderError)
                throw error;
            throw new provider_types_1.AiProviderError(error instanceof Error ? error.message : 'OpenAI request failed.', this.name, 'PROVIDER_UNAVAILABLE');
        }
    }
    async embed(request) {
        if (request.inputs.length === 0) {
            throw new provider_types_1.AiProviderError('OpenAI was asked to embed an empty batch.', this.name, 'INVALID_REQUEST');
        }
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new provider_types_1.AiProviderError('OPENAI_API_KEY is required for embeddings.', this.name, 'PROVIDER_NOT_CONFIGURED');
        }
        const model = request.model || this.embeddingModel;
        try {
            const response = await fetch(`${this.baseUrl}/embeddings`, {
                method: 'POST',
                headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
                body: JSON.stringify({ model, input: request.inputs }),
            });
            if (!response.ok) {
                throw new provider_types_1.AiProviderError(`OpenAI returned HTTP ${response.status} for embeddings.`, this.name, 'PROVIDER_REQUEST_FAILED');
            }
            const payload = (await response.json());
            const ordered = [...(payload.data ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
            const embeddings = ordered.map((row) => row.embedding ?? []);
            if (embeddings.length !== request.inputs.length || embeddings.some((vector) => vector.length === 0)) {
                throw new provider_types_1.AiProviderError(`OpenAI returned ${embeddings.length} embedding(s) for ${request.inputs.length} input(s).`, this.name, 'EMPTY_PROVIDER_RESPONSE');
            }
            return { provider: this.name, model: payload.model || model, embeddings, dimensions: embeddings[0].length };
        }
        catch (error) {
            if (error instanceof provider_types_1.AiProviderError)
                throw error;
            throw new provider_types_1.AiProviderError(error instanceof Error ? error.message : 'OpenAI embedding request failed.', this.name, 'PROVIDER_UNAVAILABLE');
        }
    }
    async generateImage(request) {
        if (!this.imageEnabled) {
            throw new provider_types_1.AiProviderError('OpenAI image generation is disabled (OPENAI_IMAGE_ENABLED=false).', this.name, 'CAPABILITY_UNSUPPORTED');
        }
        if (!process.env.OPENAI_API_KEY) {
            throw new provider_types_1.AiProviderError('OPENAI_API_KEY is required for image generation.', this.name, 'PROVIDER_NOT_CONFIGURED');
        }
        const model = request.model || this.imageModel;
        const count = Math.min(Math.max(request.count ?? 1, 1), this.maxImagesPerCall);
        const size = request.aspectRatio ? IMAGE_SIZE_BY_RATIO[request.aspectRatio] : undefined;
        let payload;
        try {
            const response = await fetch(`${this.baseUrl}/images/generations`, {
                method: 'POST',
                headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
                body: JSON.stringify({
                    model,
                    prompt: request.prompt,
                    n: count,
                    ...(size ? { size } : {}),
                    // The API defaults to a URL for some models; base64 is what this
                    // pipeline stores, and fetching a provider URL would make ISOBASH the
                    // one downloading a stranger's file.
                    response_format: 'b64_json',
                }),
            });
            if (!response.ok) {
                const body = await response.text().catch(() => '');
                throw new provider_types_1.AiProviderError(`OpenAI returned HTTP ${response.status} for image generation.${body ? ` ${body.slice(0, 300)}` : ''}`, this.name, response.status === 429 ? 'RATE_LIMITED' : 'PROVIDER_REQUEST_FAILED');
            }
            payload = (await response.json());
        }
        catch (error) {
            if (error instanceof provider_types_1.AiProviderError)
                throw error;
            throw new provider_types_1.AiProviderError(error instanceof Error ? error.message : 'OpenAI image request failed.', this.name, 'PROVIDER_UNAVAILABLE');
        }
        const images = [];
        for (const item of payload.data ?? []) {
            if (!item.b64_json)
                continue;
            images.push({
                mimeType: 'image/png',
                data: item.b64_json,
                ...(item.revised_prompt ? { note: item.revised_prompt } : {}),
            });
        }
        if (images.length === 0) {
            throw new provider_types_1.AiProviderError('OpenAI returned no image data.', this.name, 'EMPTY_PROVIDER_RESPONSE');
        }
        return {
            provider: this.name,
            model,
            images,
            requested: count,
            ...(payload.usage?.input_tokens !== undefined
                ? { usage: { inputTokens: payload.usage.input_tokens, outputTokens: payload.usage.output_tokens } }
                : {}),
        };
    }
};
exports.OpenAiProvider = OpenAiProvider;
exports.OpenAiProvider = OpenAiProvider = __decorate([
    (0, common_1.Injectable)()
], OpenAiProvider);
//# sourceMappingURL=openai.provider.js.map