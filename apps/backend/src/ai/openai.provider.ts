import { Injectable } from '@nestjs/common';
import {
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

@Injectable()
export class OpenAiProvider implements AiProvider {
  readonly name = 'openai';
  readonly capabilities = ['language'] as const;
  private readonly baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  private readonly model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

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
}
