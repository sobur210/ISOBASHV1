import { SessionUser } from '../auth/session.model';
import { KnowledgeService } from './knowledge.service';
export declare class KnowledgeController {
    private readonly knowledge;
    constructor(knowledge: KnowledgeService);
    search(user: SessionUser, query?: string, limit?: string, kind?: string, projectId?: string): Promise<import("./knowledge.service").KnowledgeSearchResult>;
    stats(user: SessionUser): Promise<{
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
}
