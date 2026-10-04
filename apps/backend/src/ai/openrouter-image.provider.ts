import { Injectable } from '@nestjs/common';
import {
  AiCapability,
  AiImageRequest,
  AiImageResponse,
  AiProvider,
  AiProviderError,
  AiProviderHealth,
  AiRequest,
  AiResponse,
} from './provider.types';

const DEFAULT_MODEL = 'openai/gpt-image-1';
const DEFAULT_TIMEOUT_MS = 180_000;

type OpenRouterImageResponse = {
  data?: Array<{ b64_json?: string; media_type?: string; revised_prompt?: string }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string; code?: string | number };
};

@Injectable()
export class OpenRouterImageProvider implements AiProvider {
  readonly name = 'openrouter';
  readonly capabilities: readonly AiCapability[] = ['image-generation'];
  private readonly model = process.env.OPENROUTER_IMAGE_MODEL || DEFAULT_MODEL;
  private readonly timeoutMs = Number(process.env.OPENROUTER_IMAGE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);

  private get apiKey(): string | undefined {
    return process.env.OPENROUTER_API_IMAGE_VIDEO || undefined;
  }

  async health(): Promise<AiProviderHealth> {
    if (!this.apiKey) {
      return {
        provider: this.name,
        status: 'unconfigured',
        capabilities: [...this.capabilities],
        detail: 'OPENROUTER_API_IMAGE_VIDEO is not configured.',
      };
    }
    return {
      provider: this.name,
      status: 'healthy',
      capabilities: [...this.capabilities],
      detail: `OpenRouter image generation is configured (${this.model}); model usage may be billed by OpenRouter.`,
    };
  }

  async execute(request: AiRequest): Promise<AiResponse> {
    throw new AiProviderError(
      `OpenRouter image generation cannot serve ${request.capability}.`,
      this.name,
      'CAPABILITY_UNSUPPORTED',
    );
  }

  async generateImage(request: AiImageRequest): Promise<AiImageResponse> {
    const apiKey = this.apiKey;
    if (!apiKey) {
      throw new AiProviderError(
        'OPENROUTER_API_IMAGE_VIDEO is required for OpenRouter image generation.',
        this.name,
        'PROVIDER_NOT_CONFIGURED',
      );
    }
    const prompt = request.prompt.trim();
    if (!prompt) {
      throw new AiProviderError('An image prompt is required.', this.name, 'INVALID_REQUEST');
    }

    const model = request.model || this.model;
    const count = Math.min(Math.max(request.count ?? 1, 1), 8);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await fetch('https://openrouter.ai/api/v1/images', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: ['Bearer', apiKey].join(' '),
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          model,
          prompt,
          n: count,
          ...(request.aspectRatio ? { aspect_ratio: request.aspectRatio } : {}),
        }),
      });
    } catch (error) {
      throw new AiProviderError(
        error instanceof Error && error.name === 'AbortError'
          ? `OpenRouter did not answer within ${this.timeoutMs}ms.`
          : `OpenRouter is unreachable: ${error instanceof Error ? error.message : 'unknown error'}.`,
        this.name,
        error instanceof Error && error.name === 'AbortError' ? 'PROVIDER_TIMEOUT' : 'PROVIDER_UNAVAILABLE',
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const body = (await response.text().catch(() => '')).slice(0, 300);
      let detail = body;
      try {
        const errorPayload = JSON.parse(body) as OpenRouterImageResponse;
        detail = errorPayload.error?.message || body;
      } catch {
        // Keep the provider's response text when it is not a JSON error envelope.
      }
      const code =
        response.status === 401 || response.status === 403
          ? 'INVALID_API_KEY'
          : response.status === 402 || response.status === 429
            ? 'RATE_LIMITED'
            : response.status === 404
              ? 'MODEL_NOT_AVAILABLE'
              : 'PROVIDER_REQUEST_FAILED';
      throw new AiProviderError(
        `OpenRouter returned HTTP ${response.status} for image generation.${detail ? ` ${detail}` : ''}`,
        this.name,
        code,
      );
    }

    let payload: OpenRouterImageResponse;
    try {
      payload = (await response.json()) as OpenRouterImageResponse;
    } catch {
      throw new AiProviderError('OpenRouter returned an invalid image response.', this.name, 'EMPTY_PROVIDER_RESPONSE');
    }

    const images = (payload.data ?? [])
      .filter((image): image is typeof image & { b64_json: string } => Boolean(image.b64_json))
      .map((image) => ({
        mimeType: image.media_type || 'image/png',
        data: image.b64_json,
        ...(image.revised_prompt ? { note: image.revised_prompt } : {}),
      }));

    if (images.length === 0) {
      throw new AiProviderError('OpenRouter returned no base64 image data.', this.name, 'EMPTY_PROVIDER_RESPONSE');
    }

    return {
      provider: this.name,
      model,
      images,
      requested: count,
      ...(payload.usage
        ? {
            usage: {
              inputTokens: payload.usage.prompt_tokens,
              outputTokens: payload.usage.completion_tokens,
            },
          }
        : {}),
    };
  }
}
