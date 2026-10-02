import { SessionUser } from '../auth/session.model';
import { AgentRunnerService } from './agent-runner.service';
import { AgentsService } from './agents.service';
import { CreateAgentDto, StartAgentRunDto, UpdateAgentDto } from './dto/agent.dto';
export declare class AgentsController {
    private readonly agents;
    private readonly runner;
    constructor(agents: AgentsService, runner: AgentRunnerService);
    list(user: SessionUser): import(".prisma/client").Prisma.PrismaPromise<({
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
    getRun(user: SessionUser, runId: string): Promise<{
        agent: {
            name: string;
            id: string;
        };
        steps: {
            error: string | null;
            id: string;
            status: import(".prisma/client").$Enums.AgentStepStatus;
            input: import(".prisma/client/runtime/library").JsonValue | null;
            createdAt: Date;
            title: string;
            output: string | null;
            tool: string | null;
            durationMs: number | null;
            runId: string;
            position: number;
        }[];
    } & {
        error: string | null;
        id: string;
        status: import(".prisma/client").$Enums.AgentRunStatus;
        provider: string | null;
        model: string | null;
        input: string;
        createdAt: Date;
        output: string | null;
        agentId: string;
        ownerId: number;
        plan: import(".prisma/client/runtime/library").JsonValue | null;
        stepsExecuted: number;
        cancelRequestedAt: Date | null;
        startedAt: Date | null;
        finishedAt: Date | null;
    }>;
    cancelRun(user: SessionUser, runId: string): Promise<{
        agent: {
            name: string;
            id: string;
        };
        steps: {
            error: string | null;
            id: string;
            status: import(".prisma/client").$Enums.AgentStepStatus;
            input: import(".prisma/client/runtime/library").JsonValue | null;
            createdAt: Date;
            title: string;
            output: string | null;
            tool: string | null;
            durationMs: number | null;
            runId: string;
            position: number;
        }[];
    } & {
        error: string | null;
        id: string;
        status: import(".prisma/client").$Enums.AgentRunStatus;
        provider: string | null;
        model: string | null;
        input: string;
        createdAt: Date;
        output: string | null;
        agentId: string;
        ownerId: number;
        plan: import(".prisma/client/runtime/library").JsonValue | null;
        stepsExecuted: number;
        cancelRequestedAt: Date | null;
        startedAt: Date | null;
        finishedAt: Date | null;
    }>;
    get(user: SessionUser, id: string): Promise<{
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
    listRuns(user: SessionUser, id: string): import(".prisma/client").Prisma.PrismaPromise<({
        steps: {
            error: string | null;
            id: string;
            status: import(".prisma/client").$Enums.AgentStepStatus;
            input: import(".prisma/client/runtime/library").JsonValue | null;
            createdAt: Date;
            title: string;
            output: string | null;
            tool: string | null;
            durationMs: number | null;
            runId: string;
            position: number;
        }[];
    } & {
        error: string | null;
        id: string;
        status: import(".prisma/client").$Enums.AgentRunStatus;
        provider: string | null;
        model: string | null;
        input: string;
        createdAt: Date;
        output: string | null;
        agentId: string;
        ownerId: number;
        plan: import(".prisma/client/runtime/library").JsonValue | null;
        stepsExecuted: number;
        cancelRequestedAt: Date | null;
        startedAt: Date | null;
        finishedAt: Date | null;
    })[]>;
    create(user: SessionUser, body: CreateAgentDto): Promise<{
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
    update(user: SessionUser, id: string, body: UpdateAgentDto): Promise<{
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
    remove(user: SessionUser, id: string): Promise<void>;
    /** Model calls are metered per user so one agent cannot burn the whole quota. */
    startRun(user: SessionUser, id: string, body: StartAgentRunDto): Promise<{
        agent: {
            name: string;
            id: string;
        };
        steps: {
            error: string | null;
            id: string;
            status: import(".prisma/client").$Enums.AgentStepStatus;
            input: import(".prisma/client/runtime/library").JsonValue | null;
            createdAt: Date;
            title: string;
            output: string | null;
            tool: string | null;
            durationMs: number | null;
            runId: string;
            position: number;
        }[];
    } & {
        error: string | null;
        id: string;
        status: import(".prisma/client").$Enums.AgentRunStatus;
        provider: string | null;
        model: string | null;
        input: string;
        createdAt: Date;
        output: string | null;
        agentId: string;
        ownerId: number;
        plan: import(".prisma/client/runtime/library").JsonValue | null;
        stepsExecuted: number;
        cancelRequestedAt: Date | null;
        startedAt: Date | null;
        finishedAt: Date | null;
    }>;
}
