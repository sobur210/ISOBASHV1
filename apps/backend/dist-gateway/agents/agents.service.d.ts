import { PrismaService } from '../prisma/prisma.service';
import { AiToolsRegistry } from '../ai/tools.registry';
import { CreateAgentDto, UpdateAgentDto } from './dto/agent.dto';
export declare class AgentsService {
    private readonly prisma;
    private readonly tools;
    constructor(prisma: PrismaService, tools: AiToolsRegistry);
    list(userId: number): import(".prisma/client").Prisma.PrismaPromise<({
        project: {
            name: string;
            id: number;
        } | null;
        _count: {
            memories: number;
            runs: number;
        };
    } & {
        name: string;
        id: string;
        createdAt: Date;
        description: string | null;
        updatedAt: Date;
        projectId: number | null;
        ownerId: number;
        instructions: string;
        providerModel: string | null;
        maxSteps: number;
        toolNames: string[];
        memoryEnabled: boolean;
    })[]>;
    get(userId: number, id: string): Promise<{
        project: {
            name: string;
            id: number;
        } | null;
    } & {
        name: string;
        id: string;
        createdAt: Date;
        description: string | null;
        updatedAt: Date;
        projectId: number | null;
        ownerId: number;
        instructions: string;
        providerModel: string | null;
        maxSteps: number;
        toolNames: string[];
        memoryEnabled: boolean;
    }>;
    create(userId: number, input: CreateAgentDto): Promise<{
        name: string;
        id: string;
        createdAt: Date;
        description: string | null;
        updatedAt: Date;
        projectId: number | null;
        ownerId: number;
        instructions: string;
        providerModel: string | null;
        maxSteps: number;
        toolNames: string[];
        memoryEnabled: boolean;
    }>;
    update(userId: number, id: string, input: UpdateAgentDto): Promise<{
        name: string;
        id: string;
        createdAt: Date;
        description: string | null;
        updatedAt: Date;
        projectId: number | null;
        ownerId: number;
        instructions: string;
        providerModel: string | null;
        maxSteps: number;
        toolNames: string[];
        memoryEnabled: boolean;
    }>;
    remove(userId: number, id: string): Promise<void>;
    /**
     * Validation for create/update.
     *
     * Tool names are checked against the live registry, so an agent can never
     * reference a capability that does not exist, and `projectId` is verified
     * against the caller's own projects: a client cannot bind an agent to
     * somebody else's workspace by sending an id.
     */
    private normalise;
    private requireOwnedProject;
}
