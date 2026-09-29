import { Injectable } from '@nestjs/common';
import {
  AiCapability,
  AiEmbeddingRequest,
  AiEmbeddingResponse,
  AiProvider,
  AiProviderError,
  AiProviderHealth,
  AiRequest,
  AiResponse,
  AiStreamChunk,
} from './provider.types';

type OllamaGenerateResponse = {
  response?: string;
  model?: string;
  prompt_eval_count?: number;
  eval_count?: number;
  done?: boolean;
};

type OllamaEmbedResponse = {
  embeddings?: number[][];
  model?: string;
};

@Injectable()
export class OllamaProvider implements AiProvider {
  readonly name = 'ollama';
  readonly capabilities: readonly AiCapability[] = ['language', 'embeddings'];
  private readonly baseUrl = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
  private readonly model = process.env.OLLAMA_MODEL || 'llama3.2:latest';
  private readonly embeddingModel = process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text';

  async health(): Promise<AiProviderHealth> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (!response.ok) {
        return { provider: this.name, status: 'unavailable', capabilities: [...this.capabilities], detail: `Ollama returned HTTP ${response.status}.` };
      }
      const payload = (await response.json()) as { models?: Array<{ name?: string }> };
      const names = (payload.models ?? []).map((model) => model.name ?? '');
      const modelAvailable = names.includes(this.model);
      const embeddingAvailable = names.includes(this.embeddingModel);
      const detail = [
        modelAvailable ? `Model ${this.model} is available.` : `Model ${this.model} is not installed.`,
        embeddingAvailable
          ? `Embedding model ${this.embeddingModel} is installed.`
          : `Embedding model ${this.embeddingModel} is not installed (run: ollama pull ${this.embeddingModel}).`,
      ].join(' ');
      return {
        provider: this.name,
        status: modelAvailable ? 'healthy' : 'unavailable',
        capabilities: [...this.capabilities],
        detail,
      };
    } catch (error) {
      return { provider: this.name, status: 'unavailable', capabilities: [...this.capabilities], detail: error instanceof Error ? error.message : 'Ollama is unreachable.' };
    }
  }

  /** True when the local embedding model is actually installed. */
  async embeddingModelAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (!response.ok) return false;
      const payload = (await response.json()) as { models?: Array<{ name?: string }> };
      return (payload.models ?? []).some((model) => model.name === this.embeddingModel);
    } catch {
      return false;
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
        body: JSON.stringify({
          model: request.model || this.model,
          prompt: request.input,
          stream: false,
          ...(request.responseFormat === 'json' ? { format: 'json' } : {}),
        }),
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

  /**
   * `POST /api/embed` takes the whole batch, which is what makes indexing a
   * document tolerable. A missing model is reported as such instead of being
   * retried against another vendor.
   */
  async embed(request: AiEmbeddingRequest): Promise<AiEmbeddingResponse> {
    if (request.inputs.length === 0) {
      throw new AiProviderError('Ollama was asked to embed an empty batch.', this.name, 'INVALID_REQUEST');
    }
    const model = request.model || this.embeddingModel;
    try {
      const response = await fetch(`${this.baseUrl}/api/embed`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model, input: request.inputs }),
      });
      if (response.status === 404) {
        throw new AiProviderError(
          `Ollama does not have the embedding model "${model}". Run: ollama pull ${model}`,
          this.name,
          'MODEL_NOT_AVAILABLE',
        );
      }
      if (!response.ok) {
        throw new AiProviderError(`Ollama returned HTTP ${response.status} for embeddings.`, this.name, 'PROVIDER_REQUEST_FAILED');
      }
      const payload = (await response.json()) as OllamaEmbedResponse;
      const embeddings = payload.embeddings ?? [];
      if (embeddings.length !== request.inputs.length || embeddings.some((vector) => !Array.isArray(vector) || vector.length === 0)) {
        throw new AiProviderError(
          `Ollama returned ${embeddings.length} embedding(s) for ${request.inputs.length} input(s).`,
          this.name,
          'EMPTY_PROVIDER_RESPONSE',
        );
      }
      return {
        provider: this.name,
        model: payload.model || model,
        embeddings,
        dimensions: embeddings[0].length,
      };
    } catch (error) {
      if (error instanceof AiProviderError) throw error;
      throw new AiProviderError(error instanceof Error ? error.message : 'Ollama embedding request failed.', this.name, 'PROVIDER_UNAVAILABLE');
    }
  }

  async *stream(request: AiRequest, signal?: AbortSignal): AsyncIterable<AiStreamChunk> {
    if (request.capability !== 'language') {
      throw new AiProviderError(`Ollama does not support ${request.capability}.`, this.name, 'CAPABILITY_UNSUPPORTED');
    }

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: request.model || this.model, prompt: request.input, stream: true }),
        signal,
      });
      if (!response.ok) {
        throw new AiProviderError(`Ollama returned HTTP ${response.status}.`, this.name, 'PROVIDER_REQUEST_FAILED');
      }
      if (!response.body) {
        throw new AiProviderError('Ollama returned no response body.', this.name, 'EMPTY_PROVIDER_RESPONSE');
      }
    } catch (error) {
      if (signal?.aborted) throw new AiProviderError('Generation aborted.', this.name, 'STREAM_ABORTED');
      if (error instanceof AiProviderError) throw error;
      throw new AiProviderError(error instanceof Error ? error.message : 'Ollama stream request failed.', this.name, 'PROVIDER_UNAVAILABLE');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let usage: { inputTokens?: number; outputTokens?: number } = {};

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newline: number;
        while ((newline = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (!line) continue;

          let payload: OllamaGenerateResponse;
          try {
            payload = JSON.parse(line) as OllamaGenerateResponse;
          } catch {
            continue;
          }

          const evalCount = payload.eval_count;
          if (evalCount != null) {
            usage.outputTokens = evalCount;
          }
          const evalPromptCount = payload.prompt_eval_count;
          if (evalPromptCount != null) {
            usage.inputTokens = evalPromptCount;
          }

          if (payload.done === true) {
            yield { type: 'done', provider: this.name, model: request.model || this.model, usage };
          } else if (payload.response) {
            yield { type: 'delta', text: payload.response };
          }
        }
      }
    } catch (error) {
      if (signal?.aborted) throw new AiProviderError('Generation aborted.', this.name, 'STREAM_ABORTED');
      throw new AiProviderError(error instanceof Error ? error.message : 'Ollama stream interrupted.', this.name, 'PROVIDER_STREAM_FAILED');
    }
  }
}
