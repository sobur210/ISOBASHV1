import { Injectable } from '@nestjs/common';
import {
  AiCapability,
  AiProvider,
  AiProviderError,
  AiProviderHealth,
  AiRequest,
  AiResponse,
  AiStreamChunk,
} from './provider.types';

@Injectable()
export class AiProviderRegistry {
  private readonly providers = new Map<string, AiProvider>();

  register(provider: AiProvider) {
    this.providers.set(provider.name, provider);
  }

  list(): AiProviderHealth[] {
    return [...this.providers.values()].map((provider) => ({
      provider: provider.name,
      status: 'unconfigured',
      capabilities: [...provider.capabilities],
      detail: 'Provider health has not been checked yet.',
    }));
  }

  capabilities() {
    return new Map([...this.providers.entries()].map(([name, provider]) => [name, provider.capabilities]));
  }

  async health(): Promise<AiProviderHealth[]> {
    return Promise.all([...this.providers.values()].map((provider) => provider.health()));
  }

  async execute(request: AiRequest): Promise<AiResponse> {
    const candidates = this.findProviders(request.capability, request.model);
    if (candidates.length === 0) {
      throw new AiProviderError(
        `No configured provider supports ${request.capability}.`,
        'registry',
        'NO_PROVIDER_AVAILABLE',
      );
    }
    let lastError: AiProviderError | undefined;
    for (const provider of candidates) {
      const status = await provider.health();
      if (status.status !== 'healthy') continue;
      try {
        return await provider.execute(normalizeRequest(request, provider.name));
      } catch (error) {
        lastError = error instanceof AiProviderError
          ? error
          : new AiProviderError('Provider execution failed.', provider.name, 'PROVIDER_EXECUTION_FAILED');
      }
    }
    throw lastError || new AiProviderError(
      `No healthy provider supports ${request.capability}.`,
      'registry',
      'NO_HEALTHY_PROVIDER',
    );
  }

  private findProviders(capability: AiCapability, model?: string) {
    const candidates = [...this.providers.values()].filter((provider) => provider.capabilities.includes(capability));
    return model ? candidates.filter((provider) => provider.name === model || model.startsWith(`${provider.name}:`)) : candidates;
  }

  async *stream(request: AiRequest, signal?: AbortSignal): AsyncGenerator<AiStreamChunk> {
    const candidates = this.findProviders(request.capability, request.model);
    if (candidates.length === 0) {
      throw new AiProviderError(
        `No configured provider supports ${request.capability}.`,
        'registry',
        'NO_PROVIDER_AVAILABLE',
      );
    }

    for (const provider of candidates) {
      const status = await provider.health();
      if (status.status !== 'healthy') continue;

      if (!provider.stream) {
        try {
          const response = await provider.execute(normalizeRequest(request, provider.name));
          yield { type: 'delta', text: response.output };
          yield { type: 'done', provider: response.provider, model: response.model, usage: response.usage };
        } catch (error) {
          yield {
            type: 'error',
            code: error instanceof AiProviderError ? error.code : 'PROVIDER_EXECUTION_FAILED',
            message: error instanceof Error ? error.message : 'Provider execution failed.',
          };
        }
        return;
      }

      try {
        yield *provider.stream(normalizeRequest(request, provider.name), signal);
      } catch (error) {
        yield {
          type: 'error',
          code: error instanceof AiProviderError ? error.code : 'PROVIDER_STREAM_FAILED',
          message: error instanceof Error ? error.message : 'Provider stream failed.',
        };
      }
      return;
    }

    throw new AiProviderError(
      `No healthy provider supports ${request.capability}.`,
      'registry',
      'NO_HEALTHY_PROVIDER',
    );
  }
}

function normalizeRequest(request: AiRequest, providerName: string): AiRequest {
  if (!request.model) return request;
  if (request.model === providerName) {
    const { model: _model, ...rest } = request;
    return rest;
  }
  const prefix = `${providerName}:`;
  if (request.model.startsWith(prefix)) {
    const model = request.model.slice(prefix.length) || undefined;
    return { ...request, model };
  }
  return request;
}
