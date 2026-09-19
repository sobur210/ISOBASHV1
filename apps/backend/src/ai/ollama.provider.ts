import { Injectable } from '@nestjs/common';
import {
  AiCapability,
  AiProvider,
  AiProviderError,
  AiProviderHealth,
  AiRequest,
  AiResponse,
} from './provider.types';

type OllamaGenerateResponse = {
  response?: string;
  model?: string;
  prompt_eval_count?: number;
  eval_count?: number;
};

@Injectable()
export class OllamaProvider implements AiProvider {
  readonly name = 'ollama';
  readonly capabilities: readonly AiCapability[] = ['language'];
  private readonly baseUrl = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
  private readonly model = process.env.OLLAMA_MODEL || 'llama3.2:latest';

  async health(): Promise<AiProviderHealth> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (!response.ok) {
        return { provider: this.name, status: 'unavailable', capabilities: [...this.capabilities], detail: `Ollama returned HTTP ${response.status}.` };
      }
      const payload = (await response.json()) as { models?: Array<{ name: string }> };
      const modelAvailable = payload.models?.some((model) => model.name === this.model) ?? false;
      return {
        provider: this.name,
        status: modelAvailable ? 'healthy' : 'unavailable',
        capabilities: [...this.capabilities],
        detail: modelAvailable ? `Model ${this.model} is available.` : `Model ${this.model} is not installed.`,
      };
    } catch (error) {
      return { provider: this.name, status: 'unavailable', capabilities: [...this.capabilities], detail: error instanceof Error ? error.message : 'Ollama is unreachable.' };
    }
  }

  async execute(request: AiRequest): Promise<AiResponse> {
    if (request.capability !== 'language') {
      throw new AiProviderError(`Ollama does not support ${request.capability}.`, this.name, 'CAPABILITY_UNSUPPORTED');
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: request.model || this.model, prompt: request.input, stream: false }),
      });
      if (!response.ok) {
        throw new AiProviderError(`Ollama returned HTTP ${response.status}.`, this.name, 'PROVIDER_REQUEST_FAILED');
      }
      const payload = (await response.json()) as OllamaGenerateResponse;
      if (!payload.response) {
        throw new AiProviderError('Ollama returned no response text.', this.name, 'EMPTY_PROVIDER_RESPONSE');
      }
      return {
        provider: this.name,
        model: payload.model || request.model || this.model,
        capability: request.capability,
        output: payload.response,
        usage: { inputTokens: payload.prompt_eval_count, outputTokens: payload.eval_count },
      };
    } catch (error) {
      if (error instanceof AiProviderError) throw error;
      throw new AiProviderError(error instanceof Error ? error.message : 'Ollama request failed.', this.name, 'PROVIDER_UNAVAILABLE');
    }
  }
}
