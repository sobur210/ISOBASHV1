import { Injectable, Logger } from '@nestjs/common';
import { AiRouterService } from '../ai/ai-router.service';
import { AiProviderError } from '../ai/provider.types';
import { InjectConfig } from '../shared/config/inject-config';
import { AppConfig } from '../shared/config/configuration';

export type EmbeddingAvailability = {
  available: boolean;
  provider: string | null;
  model: string | null;
  detail: string;
  dimensions: number | null;
};

export type EmbeddedBatch = {
  provider: string;
  model: string;
  dimensions: number;
  vectors: number[][];
};

/**
 * Phase 12 embeddings.
 *
 * Knowledge search has two halves: keyword matching always works, and vector
 * similarity works when a provider can really produce vectors. This service
 * reports which of the two is live instead of pretending both are, and never
 * substitutes one provider's vectors for another's mid-index.
 */
@Injectable()
export class EmbeddingService {
  private readonly log = new Logger('Embedding');
  private cache: { at: number; value: EmbeddingAvailability } | null = null;

  constructor(
    private readonly ai: AiRouterService,
    @InjectConfig() private readonly config: AppConfig,
  ) {}

  get enabled(): boolean {
    return this.config.files.embeddingsEnabled;
  }

  /** What embedding support exists right now, with the reason when it does not. */
  async availability(): Promise<EmbeddingAvailability> {
    if (!this.enabled) {
      return {
        available: false,
        provider: null,
        model: null,
        dimensions: null,
        detail: 'Embeddings are switched off (FILES_EMBEDDINGS_ENABLED=false); knowledge search runs on keyword matching only.',
      };
    }
    if (this.cache && Date.now() - this.cache.at < 60_000) {
      return this.cache.value;
    }
    const value = await this.probe();
    this.cache = { at: Date.now(), value };
    return value;
  }

  async embed(inputs: string[], taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY' = 'RETRIEVAL_DOCUMENT'): Promise<EmbeddedBatch> {
    if (inputs.length === 0) {
      throw new Error('No input to embed.');
    }
    const { embeddingsProvider, embeddingsModel } = this.config.files;
    const response = await this.ai.embed({
      capability: 'embeddings',
      inputs,
      ...(embeddingsProvider !== 'auto' ? { model: embeddingsModel ? `${embeddingsProvider}:${embeddingsModel}` : embeddingsProvider } : embeddingsModel ? { model: embeddingsModel } : {}),
      taskType,
    });
    return {
      provider: response.provider,
      model: response.model,
      dimensions: response.dimensions,
      vectors: response.embeddings,
    };
  }

  /** Embed, but answer honestly instead of throwing when nothing is available. */
  async tryEmbed(
    inputs: string[],
    taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY' = 'RETRIEVAL_DOCUMENT',
  ): Promise<{ batch: EmbeddedBatch } | { error: string }> {
    if (!this.enabled) {
      return { error: 'Embeddings are switched off (FILES_EMBEDDINGS_ENABLED=false).' };
    }
    try {
      return { batch: await this.embed(inputs, taskType) };
    } catch (error) {
      const message =
        error instanceof AiProviderError ? `${error.provider}: ${error.message}` : error instanceof Error ? error.message : 'The embedding call failed.';
      this.log.warn(`Embedding failed: ${message}`);
      // A failure is not cached as an answer: the next upload tries again.
      this.cache = null;
      return { error: message };
    }
  }

  private async probe(): Promise<EmbeddingAvailability> {
    const { embeddingsProvider, embeddingsModel } = this.config.files;
    const selection =
      embeddingsProvider === 'auto'
        ? embeddingsModel
          ? embeddingsModel
          : undefined
        : embeddingsModel
          ? `${embeddingsProvider}:${embeddingsModel}`
          : embeddingsProvider;
    try {
      const probeResult = await this.embed(['isobash embedding probe'], 'RETRIEVAL_QUERY');
      return {
        available: true,
        provider: probeResult.provider,
        model: probeResult.model,
        dimensions: probeResult.dimensions,
        detail: `Embeddings are available through ${probeResult.provider}:${probeResult.model} (${probeResult.dimensions} dimensions).`,
      };
    } catch (error) {
      const message =
        error instanceof AiProviderError
          ? `${error.code}: ${error.message}`
          : error instanceof Error
            ? error.message
            : 'The embedding provider could not be reached.';
      this.log.warn(`Embedding probe failed: ${message}`);
      return {
        available: false,
        provider: null,
        model: selection ?? null,
        dimensions: null,
        detail: `No embedding provider answered (${message}). Knowledge search falls back to keyword matching.`,
      };
    }
  }
}
