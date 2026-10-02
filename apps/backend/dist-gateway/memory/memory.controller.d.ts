import { SessionUser } from '../auth/session.model';
import { CreateMemoryDto } from './dto/create-memory.dto';
import { MemoryService } from './memory.service';
export declare class MemoryController {
    private readonly memory;
    constructor(memory: MemoryService);
    list(user: SessionUser, agentId?: string, query?: string, limit?: string): import(".prisma/client").Prisma.PrismaPromise<{
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
    stats(user: SessionUser): Promise<{
        total: number;
        byKind: {
            [k: string]: number;
        };
    }>;
    create(user: SessionUser, body: CreateMemoryDto): Promise<{
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
    remove(user: SessionUser, id: string): Promise<void>;
}
