import { AiRouterService } from '../ai/ai-router.service';
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
export declare class EmbeddingService {
    private readonly ai;
    private readonly config;
    private readonly log;
    private cache;
    constructor(ai: AiRouterService, config: AppConfig);
    get enabled(): boolean;
    /** What embedding support exists right now, with the reason when it does not. */
    availability(): Promise<EmbeddingAvailability>;
    embed(inputs: string[], taskType?: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY'): Promise<EmbeddedBatch>;
    /** Embed, but answer honestly instead of throwing when nothing is available. */
    tryEmbed(inputs: string[], taskType?: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY'): Promise<{
        batch: EmbeddedBatch;
    } | {
        error: string;
    }>;
    private probe;
}
