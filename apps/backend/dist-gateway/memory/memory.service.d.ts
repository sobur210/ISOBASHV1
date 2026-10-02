import { PrismaService } from '../prisma/prisma.service';
export type MemoryScope = {
    userId: number;
    agentId?: string;
    projectId?: number;
};
export declare class MemoryService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    list(scope: MemoryScope, options?: {
        query?: string;
        limit?: number;
    }): import(".prisma/client").Prisma.PrismaPromise<{
        id: string;
        createdAt: Date;
        content: string;
        kind: import(".prisma/client").$Enums.MemoryKind;
        source: string;
        sourceId: string | null;
        updatedAt: Date;
        lastAccessedAt: Date | null;
        userId: number;
        agentId: string | null;
        projectId: number | null;
    }[]>;
    create(scope: MemoryScope, input: {
        content: string;
        kind?: 'FACT' | 'PREFERENCE' | 'SUMMARY' | 'NOTE';
        source?: string;
        sourceId?: string;
    }): Promise<{
        id: string;
        createdAt: Date;
        content: string;
        kind: import(".prisma/client").$Enums.MemoryKind;
        source: string;
        sourceId: string | null;
        updatedAt: Date;
        lastAccessedAt: Date | null;
        userId: number;
        agentId: string | null;
        projectId: number | null;
    }>;
    remove(scope: MemoryScope, id: string): Promise<void>;
    /** Most recent memories for prompt injection. Ordered by recency on purpose. */
    recall(userId: number, limit?: number): Promise<{
        id: string;
        content: string;
        kind: import(".prisma/client").$Enums.MemoryKind;
        updatedAt: Date;
    }[]>;
    stats(userId: number): Promise<{
        total: number;
        byKind: {
            [k: string]: number;
        };
    }>;
}
