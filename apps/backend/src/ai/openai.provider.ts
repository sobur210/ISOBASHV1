import { Injectable } from '@nestjs/common';
import {
  AiCapability,
  AiEmbeddingRequest,
  AiEmbeddingResponse,
  AiGeneratedImage,
  AiImageRequest,
  AiImageResponse,
  AiProvider,
  AiProviderError,
  AiProviderHealth,
  AiRequest,
  AiResponse,
} from './provider.types';

type ChatCompletionResponse = {
  model?: string;
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

type EmbeddingResponse = {
  model?: string;
  data?: Array<{ embedding?: number[]; index?: number }>;
};

type ImageGenerationResponse = {
  data?: Array<{ b64_json?: string; url?: string; revised_prompt?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
};

/** `1:1`-style ratios become the sizes the images API actually accepts. */
const IMAGE_SIZE_BY_RATIO: Record<string, string> = {
  '1:1': '1024x1024',
  '3:4': '1024x1536',
  '4:3': '1536x1024',
  '9:16': '1024x1536',
  '16:9': '1536x1024',
};

@Injectable()
export class OpenAiProvider implements AiProvider {
  readonly name = 'openai';
  /** Image generation is opt-out, exactly like Gemini's: a deployment that only
   * wants chat and embeddings sets `OPENAI_IMAGE_ENABLED=false`. */
  private readonly imageEnabled = process.env.OPENAI_IMAGE_ENABLED !== 'false';
  readonly capabilities: readonly AiCapability[] = this.imageEnabled
    ? ['language', 'embeddings', 'image-generation']
    : ['language', 'embeddings'];
  private readonly baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  private readonly model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  private readonly embeddingModel = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
  private readonly imageModel = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';
  /** Hard ceiling so a bad `count` cannot turn one request into an unbounded spend. */
  private readonly maxImagesPerCall = 8;

  async health(): Promise<AiProviderHealth> {
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

  async execute(request: AiRequest): Promise<AiResponse> {
    if (request.capability !== 'language') {
      throw new AiProviderError(`OpenAI does not support ${request.capability}.`, this.name, 'CAPABILITY_UNSUPPORTED');
    }
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new AiProviderError('OPENAI_API_KEY is required for cloud execution.', this.name, 'PROVIDER_NOT_CONFIGURED');
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
        throw new AiProviderError(`OpenAI returned HTTP ${response.status}.`, this.name, 'PROVIDER_REQUEST_FAILED');
      }
      const payload = (await response.json()) as ChatCompletionResponse;
      const output = payload.choices?.[0]?.message?.content;
      if (!output) {
        throw new AiProviderError('OpenAI returned no response text.', this.name, 'EMPTY_PROVIDER_RESPONSE');
      }
      return {
        provider: this.name,
        model: payload.model || request.model || this.model,
        capability: request.capability,
        output,
        usage: { inputTokens: payload.usage?.prompt_tokens, outputTokens: payload.usage?.completion_tokens },
      };
    } catch (error) {
      if (error instanceof AiProviderError) throw error;
      throw new AiProviderError(error instanceof Error ? error.message : 'OpenAI request failed.', this.name, 'PROVIDER_UNAVAILABLE');
    }
  }

  async embed(request: AiEmbeddingRequest): Promise<AiEmbeddingResponse> {
    if (request.inputs.length === 0) {
      throw new AiProviderError('OpenAI was asked to embed an empty batch.', this.name, 'INVALID_REQUEST');
    }
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new AiProviderError('OPENAI_API_KEY is required for embeddings.', this.name, 'PROVIDER_NOT_CONFIGURED');
    }
    const model = request.model || this.embeddingModel;
    try {
      const response = await fetch(`${this.baseUrl}/embeddings`, {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model, input: request.inputs }),
      });
      if (!response.ok) {
        throw new AiProviderError(`OpenAI returned HTTP ${response.status} for embeddings.`, this.name, 'PROVIDER_REQUEST_FAILED');
      }
      const payload = (await response.json()) as EmbeddingResponse;
      const ordered = [...(payload.data ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
      const embeddings = ordered.map((row) => row.embedding ?? []);
      if (embeddings.length !== request.inputs.length || embeddings.some((vector) => vector.length === 0)) {
        throw new AiProviderError(
          `OpenAI returned ${embeddings.length} embedding(s) for ${request.inputs.length} input(s).`,
          this.name,
          'EMPTY_PROVIDER_RESPONSE',
        );
      }
      return { provider: this.name, model: payload.model || model, embeddings, dimensions: embeddings[0].length };
    } catch (error) {
      if (error instanceof AiProviderError) throw error;
      throw new AiProviderError(error instanceof Error ? error.message : 'OpenAI embedding request failed.', this.name, 'PROVIDER_UNAVAILABLE');
    }
  }

  async generateImage(request: AiImageRequest): Promise<AiImageResponse> {
    if (!this.imageEnabled) {
      throw new AiProviderError(
        'OpenAI image generation is disabled (OPENAI_IMAGE_ENABLED=false).',
        this.name,
        'CAPABILITY_UNSUPPORTED',
      );
    }
    if (!process.env.OPENAI_API_KEY) {
      throw new AiProviderError(
        'OPENAI_API_KEY is required for image generation.',
        this.name,
        'PROVIDER_NOT_CONFIGURED',
      );
    }
    const model = request.model || this.imageModel;
    const count = Math.min(Math.max(request.count ?? 1, 1), this.maxImagesPerCall);
    const size = request.aspectRatio ? IMAGE_SIZE_BY_RATIO[request.aspectRatio] : undefined;

    let payload: ImageGenerationResponse;
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
        throw new AiProviderError(
          `OpenAI returned HTTP ${response.status} for image generation.${body ? ` ${body.slice(0, 300)}` : ''}`,
          this.name,
          response.status === 429 ? 'RATE_LIMITED' : 'PROVIDER_REQUEST_FAILED',
        );
      }
      payload = (await response.json()) as ImageGenerationResponse;
    } catch (error) {
      if (error instanceof AiProviderError) throw error;
      throw new AiProviderError(
        error instanceof Error ? error.message : 'OpenAI image request failed.',
        this.name,
        'PROVIDER_UNAVAILABLE',
      );
    }

    const images: AiGeneratedImage[] = [];
    for (const item of payload.data ?? []) {
      if (!item.b64_json) continue;
      images.push({
        mimeType: 'image/png',
        data: item.b64_json,
        ...(item.revised_prompt ? { note: item.revised_prompt } : {}),
      });
    }
    if (images.length === 0) {
      throw new AiProviderError('OpenAI returned no image data.', this.name, 'EMPTY_PROVIDER_RESPONSE');
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
}
