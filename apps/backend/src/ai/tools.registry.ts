import { Injectable, Logger } from '@nestjs/common';
import { AuditService } from '../security/audit.service';
import { builtinTools } from './tools/builtin-tools';
import { AnyToolDefinition, ToolContext, ToolError, ToolResult } from './tools/tool.types';

export type AiToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  risk: AnyToolDefinition['risk'];
  timeoutMs: number;
  maxArgumentLength: number;
  audited: boolean;
};

export type ToolInvocation = {
  tool: string;
  risk: AnyToolDefinition['risk'];
  durationMs: number;
  result: ToolResult;
};

/**
 * Phase 10 governed tool registry.
 *
 * The Phase 2 registry was a name -> definition map with an empty catalogue.
 * Every tool is now a governed capability: it declares a JSON schema, a risk
 * class, a timeout and an argument ceiling, and the registry enforces the whole
 * envelope around `execute`:
 *
 *   allow-list -> payload size -> authorize -> validate -> timeout -> audit
 *
 * Agents never receive host access. They can only reach tools the owner
 * explicitly allow-listed on the agent, each of which re-checks ownership of the
 * rows it touches.
 */
@Injectable()
export class AiToolsRegistry {
  private readonly log = new Logger('Tools');
  private readonly tools = new Map<string, AnyToolDefinition>();

  constructor(private readonly audit: AuditService) {
    for (const tool of builtinTools()) {
      this.register(tool);
    }
  }

  register(definition: AnyToolDefinition) {
    this.tools.set(definition.name, definition);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  get(name: string): AnyToolDefinition | undefined {
    return this.tools.get(name);
  }

  /** Catalogue for `GET /ai/tools`. */
  list(): AiToolDefinition[] {
    return [...this.tools.values()].map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      risk: tool.risk,
      timeoutMs: tool.timeoutMs,
      maxArgumentLength: tool.maxArgumentLength,
      audited: tool.audit,
    }));
  }

  /**
   * Names the planner is allowed to emit for this agent. An empty allow-list
   * means the agent has no tools at all: capability is opt-in, never implicit.
   */
  allowedFor(allowList: readonly string[]): AnyToolDefinition[] {
    return allowList
      .map((name) => this.tools.get(name))
      .filter((tool): tool is AnyToolDefinition => Boolean(tool));
  }

  async invoke(name: string, rawArgs: unknown, ctx: ToolContext): Promise<ToolInvocation> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new ToolError(`Unknown tool "${name}".`, 'UNKNOWN_TOOL');
    }
    if (ctx.signal.aborted) {
      throw new ToolError('Run cancelled before the tool started.', 'RUN_CANCELLED');
    }

    const serialized = safeStringify(rawArgs);
    if (serialized.length > tool.maxArgumentLength) {
      throw new ToolError(
        `Arguments for "${name}" exceed ${tool.maxArgumentLength} characters.`,
        'RESOURCE_LIMIT',
      );
    }

    const started = Date.now();
    let outcome: 'succeeded' | 'failed' = 'succeeded';
    let failureCode: string | undefined;
    try {
      tool.authorize?.(rawArgs, ctx);
      const args = tool.validate(rawArgs);
      const result = await withTimeout(tool.execute(args, ctx), tool.timeoutMs, name);
      if (ctx.signal.aborted) {
        throw new ToolError('Run cancelled while the tool was executing.', 'RUN_CANCELLED');
      }
      return { tool: name, risk: tool.risk, durationMs: Date.now() - started, result };
    } catch (error) {
      outcome = 'failed';
      failureCode = error instanceof ToolError ? error.code : 'TOOL_FAILED';
      const message = error instanceof Error ? error.message : `Tool "${name}" failed.`;
      this.log.warn(`Tool ${name} failed for run ${ctx.runId}: ${failureCode} ${message}`);
      throw error instanceof ToolError ? error : new ToolError(message, failureCode);
    } finally {
      if (tool.audit) {
        await this.audit.log({
          category: 'SECURITY',
          action: outcome === 'succeeded' ? 'agent_tool_invoked' : 'agent_tool_failed',
          actorId: ctx.actor.userId,
          actorEmail: ctx.actor.userEmail,
          metadata: {
            tool: name,
            risk: tool.risk,
            runId: ctx.runId,
            agentId: ctx.agentId,
            durationMs: Date.now() - started,
            ...(failureCode ? { code: failureCode } : {}),
          },
        });
      }
    }
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new ToolError(`Tool "${label}" exceeded its ${timeoutMs}ms budget.`, 'TOOL_TIMEOUT'));
    }, timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error: unknown) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function safeStringify(value: unknown): string {
  if (value === undefined) return '';
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return String(value);
  }
}
