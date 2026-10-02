import { OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiRouterService } from '../ai/ai-router.service';
import { AiToolsRegistry } from '../ai/tools.registry';
import { RealtimeService } from '../realtime/realtime.service';
import { MemoryService } from '../memory/memory.service';
import { AuditService } from '../security/audit.service';
import { SessionUser } from '../auth/session.model';
export type PlannedStep = {
    title: string;
    tool?: string;
    arguments?: Record<string, unknown>;
};
/**
 * Phase 10 agent execution.
 *
 * A run is a real state machine persisted in `AgentRun` / `AgentStep`:
 *
 *   PENDING -> PLANNING -> RUNNING -> COMPLETED | FAILED | CANCELLED
 *
 * The planner is a real model call in JSON mode, so the plan is whatever the
 * model actually returned. If it is not usable the run fails with `PLAN_INVALID`
 * and the raw text: there is no synthetic fallback plan, because a fabricated
 * plan is exactly the "fake success" the spec forbids.
 *
 * Cancellation is cooperative and honest: the abort signal is checked between
 * steps and a cancelled run keeps whatever output it had already produced
 * instead of pretending to have finished.
 *
 * Execution is in-process for Phase 10. Moving this same body onto a BullMQ
 * worker is Phase 15 (background jobs and realtime), not a redesign.
 */
export declare class AgentRunnerService implements OnModuleDestroy {
    private readonly prisma;
    private readonly ai;
    private readonly tools;
    private readonly memory;
    private readonly realtime;
    private readonly audit;
    private readonly log;
    private readonly active;
    constructor(prisma: PrismaService, ai: AiRouterService, tools: AiToolsRegistry, memory: MemoryService, realtime: RealtimeService, audit: AuditService);
    onModuleDestroy(): void;
    listRuns(userId: number, agentId: string): import(".prisma/client").Prisma.PrismaPromise<({
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
    getRun(userId: number, runId: string): Promise<{
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
    /** Start a run and execute it in the background, returning real initial state. */
    start(user: SessionUser, agentId: string, input: string): Promise<{
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
    /** Request cancellation; the run keeps partial output and reports CANCELLED. */
    cancel(user: SessionUser, runId: string): Promise<{
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
    private track;
    private executeRun;
    private finish;
    /**
     * Ask the model for a plan. JSON mode is requested from the provider and the
     * answer is still validated here, because a model can return prose in JSON
     * mode. Anything unusable fails the run honestly.
     */
    private plan;
    private runToolStep;
    private runReasoningStep;
    private synthesise;
    private emit;
}
