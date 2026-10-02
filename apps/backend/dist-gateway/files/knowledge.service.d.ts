import { AppConfig } from '../shared/config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { EmbeddingService } from './embedding.service';
export type KnowledgeHit = {
    chunkId: string;
    ordinal: number;
    fileId: string;
    fileName: string;
    kind: string;
    score: number;
    keywordScore: number | null;
    vectorScore: number | null;
    matchedBy: 'keyword' | 'vector' | 'hybrid';
    characters: number;
    snippet: string;
};
export type KnowledgeSearchResult = {
    query: string;
    terms: string[];
    mode: 'keyword' | 'vector' | 'hybrid';
    detail: string;
    hits: KnowledgeHit[];
    candidatesConsidered: number;
    tookMs: number;
};
/**
 * Phase 12 knowledge retrieval.
 *
 * Two real scorers, never one faked as the other:
 *  - keyword: BM25 over the caller's own chunks, with document frequencies read
 *    from PostgreSQL so a term that appears in everything scores nothing;
 *  - vector: cosine similarity between the query embedding and the stored chunk
 *    embeddings, computed in this process because the database has no vector
 *    extension.
 *
 * The response always says which one produced a hit (`matchedBy`) and states in
 * `detail` whether vector search ran at all. A caller must never have to guess
 * whether "no results" means "nothing matches" or "the vector half was missing".
 */
export declare class KnowledgeService {
    private readonly prisma;
    private readonly embeddings;
    private readonly config;
    constructor(prisma: PrismaService, embeddings: EmbeddingService, config: AppConfig);
    search(userId: number, rawQuery: string, options?: {
        limit?: number;
        kind?: string;
        projectId?: number;
    }): Promise<KnowledgeSearchResult>;
    stats(userId: number): Promise<{
        files: number;
        chunks: number;
        embeddedChunks: number;
        characters: number;
        storedBytes: number;
        filesByKind: {
            [k: string]: number;
        };
        filesByStatus: {
            [k: string]: number;
        };
        embeddings: import("./embedding.service").EmbeddingAvailability;
        searchCandidateLimit: number;
    }>;
    private keywordSearch;
    private vectorSearch;
    private toHit;
}
export declare function tokenise(value: string): string[];
