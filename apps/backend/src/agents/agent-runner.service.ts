import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import type { Agent } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AiRouterService } from '../ai/ai-router.service';
import { AiToolsRegistry } from '../ai/tools.registry';
import { ToolContext, ToolError } from '../ai/tools/tool.types';
import { RealtimeService } from '../realtime/realtime.service';
import { MemoryService } from '../memory/memory.service';
import { AuditService } from '../security/audit.service';
import { SessionUser } from '../auth/session.model';

export type PlannedStep = {
  title: string;
  tool?: string;
  arguments?: Record<string, unknown>;
};

const MAX_PLANNED_STEPS = 8;

/** Planning is retried once with the rejection reason before the run is failed. */
const MAX_PLAN_ATTEMPTS = 2;

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
@Injectable()
export class AgentRunnerService implements OnModuleDestroy {
  private readonly log = new Logger('AgentRunner');
  private readonly active = new Map<string, AbortController>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiRouterService,
    private readonly tools: AiToolsRegistry,
    private readonly memory: MemoryService,
    private readonly realtime: RealtimeService,
    private readonly audit: AuditService,
  ) {}

  onModuleDestroy() {
    for (const controller of this.active.values()) {
      controller.abort();
    }
    this.active.clear();
  }

  listRuns(userId: number, agentId: string) {
    return this.prisma.agentRun.findMany({
      where: { agentId, ownerId: userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { steps: { orderBy: { position: 'asc' } } },
    });
  }

  async getRun(userId: number, runId: string) {
    const run = await this.prisma.agentRun.findFirst({
      where: { id: runId, ownerId: userId },
      include: { steps: { orderBy: { position: 'asc' } }, agent: { select: { id: true, name: true } } },
    });
    if (!run) {
      throw new NotFoundException('Agent run not found.');
    }
    return run;
  }

  /** Start a run and execute it in the background, returning real initial state. */
  async start(user: SessionUser, agentId: string, input: string) {
    const agent = await this.prisma.agent.findFirst({ where: { id: agentId, ownerId: user.id } });
    if (!agent) {
      throw new NotFoundException('Agent not found.');
    }
    const trimmed = input.trim();
    if (!trimmed) {
      throw new BadRequestException('Agent input is required.');
    }

    const run = await this.prisma.agentRun.create({
      data: { agentId: agent.id, ownerId: user.id, input: trimmed, status: 'PENDING' },
    });

    this.track(this.executeRun(run.id, user, agent, trimmed));
    return this.getRun(user.id, run.id);
  }

  /** Request cancellation; the run keeps partial output and reports CANCELLED. */
  async cancel(user: SessionUser, runId: string) {
    const run = await this.getRun(user.id, runId);
    if (run.status === 'COMPLETED' || run.status === 'FAILED' || run.status === 'CANCELLED') {
      throw new BadRequestException(`Run is already ${run.status.toLowerCase()}.`);
    }
    await this.prisma.agentRun.update({
      where: { id: run.id },
      data: { cancelRequestedAt: new Date() },
    });
    this.active.get(run.id)?.abort();
    this.emit(run.ownerId, run.agentId, { runId: run.id, status: 'CANCELLING' });
    return this.getRun(user.id, run.id);
  }

  private track(promise: Promise<void>) {
    promise.catch((error: unknown) => {
      this.log.error(`Run crashed: ${error instanceof Error ? error.message : String(error)}`);
    });
  }

  private async executeRun(runId: string, user: SessionUser, agent: Agent, input: string) {
    const controller = new AbortController();
    this.active.set(runId, controller);

    const ctx: ToolContext = {
      actor: { userId: user.id, userEmail: user.email, role: user.role },
      agentId: agent.id,
      agentName: agent.name,
      runId,
      projectId: agent.projectId,
      signal: controller.signal,
      deps: { prisma: this.prisma, audit: this.audit },
    };

    const allowedTools = this.tools.allowedFor(agent.toolNames);
    const toolNames = allowedTools.map((tool) => tool.name);
    const model = agent.providerModel ?? undefined;
    const scope = {
      userId: user.id,
      agentId: agent.id,
      ...(agent.projectId ? { projectId: agent.projectId } : {}),
    };

    try {
      await this.prisma.agentRun.update({ where: { id: runId }, data: { status: 'PLANNING' } });
      this.emit(user.id, agent.id, { runId, status: 'PLANNING' });

      const memories = agent.memoryEnabled ? await this.memory.recall(user.id, 8) : [];
      const planned = await this.plan(runId, agent, input, memories, toolNames, model);
      const plan = planned.steps;
      const budget = Math.max(1, Math.min(agent.maxSteps, MAX_PLANNED_STEPS));

      await this.prisma.agentRun.update({
        where: { id: runId },
        data: {
          plan: plan.slice(0, budget) as object,
          status: 'RUNNING',
          startedAt: new Date(),
        },
      });
      const steps = plan.slice(0, budget);
      this.emit(user.id, agent.id, { runId, status: 'RUNNING', steps: steps.length });

      const transcript: string[] = [];
      let executed = 0;

      for (const [index, step] of steps.entries()) {
        if (controller.signal.aborted) {
          await this.finish(runId, user.id, agent.id, 'CANCELLED', transcript.join('\n\n'));
          return;
        }

        const stepRow = await this.prisma.agentStep.create({
          data: {
            runId,
            position: index + 1,
            title: step.title,
            tool: step.tool ?? null,
            input: (step.arguments ?? undefined) as object | undefined,
          },
          select: { id: true },
        });
        const startedAt = Date.now();
        // A step that ran and failed still ran: `stepsExecuted` counts attempts, not
        // successes, so the number can never overstate what actually happened.
        executed += 1;

        try {
          const output = step.tool
            ? await this.runToolStep(ctx, step, toolNames)
            : await this.runReasoningStep(agent, step, transcript, model);
          await this.prisma.agentStep.update({
            where: { id: stepRow.id },
            data: { status: 'SUCCEEDED', output, durationMs: Date.now() - startedAt },
          });
          transcript.push(`Step ${index + 1} - ${step.title}\n${output}`);
          this.emit(user.id, agent.id, {
            runId,
            status: 'RUNNING',
            step: index + 1,
            of: steps.length,
            stepStatus: 'SUCCEEDED',
          });
        } catch (error) {
          if (controller.signal.aborted) {
            await this.prisma.agentStep.update({
              where: { id: stepRow.id },
              data: { status: 'SKIPPED', durationMs: Date.now() - startedAt },
            });
            await this.finish(runId, user.id, agent.id, 'CANCELLED', transcript.join('\n\n'));
            return;
          }
          const message = error instanceof Error ? error.message : 'Step failed.';
          await this.prisma.agentStep.update({
            where: { id: stepRow.id },
            data: { status: 'FAILED', error: message, durationMs: Date.now() - startedAt },
          });
          transcript.push(`Step ${index + 1} - ${step.title}\nFAILED: ${message}`);
          this.emit(user.id, agent.id, {
            runId,
            status: 'RUNNING',
            step: index + 1,
            of: steps.length,
            stepStatus: 'FAILED',
          });
        }
      }

      if (controller.signal.aborted) {
        await this.finish(runId, user.id, agent.id, 'CANCELLED', transcript.join('\n\n'));
        return;
      }

      const output = await this.synthesise(agent, transcript, model);
      await this.prisma.agentRun.update({
        where: { id: runId },
        data: { status: 'COMPLETED', output, stepsExecuted: executed, finishedAt: new Date() },
      });
      this.emit(user.id, agent.id, { runId, status: 'COMPLETED' });

      if (agent.memoryEnabled && output) {
        await this.memory.create(scope, {
          content: output.slice(0, 2000),
          kind: 'SUMMARY',
          source: 'agent_run',
          sourceId: runId,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Agent run failed.';
      const status = controller.signal.aborted ? 'CANCELLED' : 'FAILED';
      await this.finish(runId, user.id, agent.id, status, null, message);
      this.log.warn(`Run ${runId} ${status}: ${message}`);
    } finally {
      this.active.delete(runId);
    }
  }

  private async finish(
    runId: string,
    userId: number,
    agentId: string,
    status: 'COMPLETED' | 'FAILED' | 'CANCELLED',
    output: string | null,
    error?: string,
  ) {
    await this.prisma.agentRun.update({
      where: { id: runId },
      data: { status, output, error: error ?? null, finishedAt: new Date() },
    });
    this.emit(userId, agentId, { runId, status, error: error ?? null });
  }

  /**
   * Ask the model for a plan. JSON mode is requested from the provider and the
   * answer is still validated here, because a model can return prose in JSON
   * mode. Anything unusable fails the run honestly.
   */
  private async plan(
    runId: string,
    agent: Agent,
    input: string,
    memories: Array<{ kind: string; content: string }>,
    toolNames: string[],
    model: string | undefined,
  ): Promise<{ steps: PlannedStep[]; route: { provider: string; model: string } }> {
    const catalogue = toolNames.length
      ? this.tools
          .allowedFor(toolNames)
          .map((tool) => `- ${tool.name}: ${tool.description} arguments: ${describeArguments(tool.parameters)}`)
          .join('\n')
      : '- (no tools are enabled for this agent, so every step is a reasoning step)';

    const budget = Math.max(1, Math.min(agent.maxSteps, MAX_PLANNED_STEPS));
    const base = [
      'You are the planning component of an AI agent running inside ISOBASH.',
      `Agent name: ${agent.name}`,
      agent.instructions ? `Agent instructions: ${agent.instructions}` : '',
      memories.length
        ? `What you already know about this user:\n${memories.map((memory) => `- [${memory.kind}] ${memory.content}`).join('\n')}`
        : '',
      `Tools you may call:\n${catalogue}`,
      '',
      `Write a plan of at most ${budget} steps for the request below.`,
      'A step is either a tool call (set "tool" to one of the names above plus "arguments") or a reasoning step (omit "tool").',
      'Every tool argument must be filled with a real value taken from the request. Never leave an argument empty or as a placeholder.',
      'Reply with one JSON object and nothing else, exactly shaped like:',
      '{"steps":[{"title":"short imperative title","tool":"tool.name","arguments":{"key":"value"}}]}',
      '',
      `Request: ${input}`,
    ].filter(Boolean);

    // One bounded repair attempt. A small model regularly names a tool that does not
    // exist or returns prose in JSON mode; being told exactly what went wrong is
    // cheap and usually fixes it. If the retry also fails the run fails honestly.
    let correction = '';
    let lastFailure = '';
    for (let attempt = 0; attempt < MAX_PLAN_ATTEMPTS; attempt += 1) {
      const response = await this.ai.execute({
        capability: 'language',
        input: correction ? `${base.join('\n')}\n${correction}` : base.join('\n'),
        ...(model ? { model } : {}),
        responseFormat: 'json',
      });

      // Recorded before validation, so a run that fails with PLAN_INVALID still says
      // which model produced the unusable output.
      await this.prisma.agentRun.update({
        where: { id: runId },
        data: { provider: response.provider, model: response.model },
      });

      try {
        const steps = normalisePlan(extractJsonObject(response.output), toolNames, budget);
        if (steps.length === 0) {
          throw new Error(
            `PLAN_INVALID: the model did not return a usable plan. Raw output: ${response.output.slice(0, 500)}`,
          );
        }
        return { steps, route: { provider: response.provider, model: response.model } };
      } catch (error) {
        lastFailure = error instanceof Error ? error.message : 'The plan was unusable.';
        correction = [
          'Your previous reply was rejected:',
          lastFailure,
          toolNames.length
            ? `Reply again using only these exact tool names: ${toolNames.join(', ')}.`
            : 'Reply again with reasoning steps only and no "tool" field.',
        ].join('\n');
      }
    }

    throw new Error(lastFailure);
  }

  private async runToolStep(ctx: ToolContext, step: PlannedStep, allowed: string[]): Promise<string> {
    const name = step.tool as string;
    if (!allowed.includes(name)) {
      throw new ToolError(`Tool "${name}" is not enabled for this agent.`, 'TOOL_NOT_ALLOWED');
    }
    const invocation = await this.tools.invoke(name, step.arguments ?? {}, ctx);
    return invocation.result.output;
  }

  private async runReasoningStep(
    agent: Agent,
    step: PlannedStep,
    transcript: string[],
    model: string | undefined,
  ): Promise<string> {
    const response = await this.ai.execute({
      capability: 'language',
      input: [
        `You are the agent "${agent.name}".`,
        agent.instructions ? `Follow these instructions: ${agent.instructions}` : '',
        transcript.length ? `Work completed so far:\n${transcript.join('\n\n')}` : '',
        `Complete this step: ${step.title}`,
        'Answer directly and concretely. If it cannot be done, say so plainly instead of guessing.',
      ]
        .filter(Boolean)
        .join('\n'),
      ...(model ? { model } : {}),
    });
    return response.output;
  }

  private async synthesise(agent: Agent, transcript: string[], model: string | undefined): Promise<string> {
    if (transcript.length === 0) {
      throw new Error('The run produced no step output, so there is nothing to summarise.');
    }
    const response = await this.ai.execute({
      capability: 'language',
      input: [
        `You are the agent "${agent.name}".`,
        agent.instructions ? `Instructions: ${agent.instructions}` : '',
        'These are the real results of the steps you executed:',
        transcript.join('\n\n'),
        'Write the final answer for the user. Never claim a step succeeded if its own output says it failed.',
      ]
        .filter(Boolean)
        .join('\n'),
      ...(model ? { model } : {}),
    });
    return response.output;
  }

  private emit(userId: number, agentId: string, payload: Record<string, unknown>) {
    this.realtime.emitToUser(userId, 'agent:run', { agentId, ...payload });
  }
}

/**
 * Render a tool's JSON Schema as a flat argument hint. Small local models copy
 * these names verbatim, which is the difference between a working tool call and
 * a step that fails validation with empty arguments.
 */
function describeArguments(schema: Record<string, unknown>): string {
  const properties = schema.properties as Record<string, { type?: string }> | undefined;
  const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
  if (!properties) return '{}';
  return Object.entries(properties)
    .map(([name, definition]) => `"${name}": "${definition?.type ?? 'string'}"${required.includes(name) ? ' (required)' : ''}`)
    .join(', ');
}

function extractJsonObject(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) {
    return null;
  }
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

function normalisePlan(parsed: unknown, toolNames: string[], budget: number): PlannedStep[] {
  const rawSteps = Array.isArray(parsed)
    ? parsed
    : typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as { steps?: unknown }).steps)
      ? (parsed as { steps: unknown[] }).steps
      : [];

  const steps: PlannedStep[] = [];
  for (const entry of rawSteps.slice(0, budget)) {
    if (typeof entry !== 'object' || entry === null) continue;
    const record = entry as Record<string, unknown>;
    const title = typeof record.title === 'string' ? record.title.trim().slice(0, 200) : '';
    if (!title) continue;

    const requestedTool = typeof record.tool === 'string' ? record.tool.trim() : '';
    if (requestedTool && !toolNames.includes(requestedTool)) {
      // A model naming a tool the agent does not have must not silently become a
      // reasoning step: that would hide an authorization boundary.
      throw new Error(
        `PLAN_INVALID: the plan requested tool "${requestedTool}", which is not enabled for this agent.`,
      );
    }
    const args =
      typeof record.arguments === 'object' && record.arguments !== null && !Array.isArray(record.arguments)
        ? (record.arguments as Record<string, unknown>)
        : undefined;

    steps.push(
      requestedTool
        ? { title, tool: requestedTool, arguments: args ?? {} }
        : { title },
    );
  }
  return steps;
}
