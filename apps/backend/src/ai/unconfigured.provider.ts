import { AiProvider, AiProviderError, AiProviderHealth, AiRequest, AiResponse } from './provider.types';

export class UnconfiguredAiProvider implements AiProvider {
  readonly name = 'unconfigured';
  readonly capabilities = ['language', 'vision', 'embeddings', 'image-generation', 'video-generation', 'research'] as const;

  async health(): Promise<AiProviderHealth> {
    return {
      provider: this.name,
      status: 'unconfigured',
      capabilities: [...this.capabilities],
      detail: 'Configure a real provider adapter before requesting AI execution.',
    };
  }

  async execute(_request: AiRequest): Promise<AiResponse> {
    throw new AiProviderError(
      'AI provider configuration is required before execution.',
      this.name,
      'PROVIDER_NOT_CONFIGURED',
    );
  }
}
