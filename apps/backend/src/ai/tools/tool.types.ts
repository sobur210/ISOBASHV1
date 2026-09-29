import type { PrismaService } from '../../prisma/prisma.service';
import type { AuditService } from '../../security/audit.service';

export type ToolRisk = 'low' | 'medium' | 'high';

export type ToolActor = {
  userId: number;
  userEmail: string;
  role: 'ADMIN' | 'USER';
};

export type ToolContext = {
  actor: ToolActor;
  agentId: string;
  agentName: string;
  runId: string;
  projectId: number | null;
  signal: AbortSignal;
  deps: ToolDeps;
};

export type ToolDeps = {
  prisma: PrismaService;
  audit: AuditService;
};

export type ToolResult = {
  /** Human/model readable result. Never fabricated: it is the tool's real output. */
  output: string;
  data?: Record<string, unknown>;
};

export class ToolError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'ToolError';
  }
}

export type ToolDefinition<P = Record<string, unknown>> = {
  name: string;
  description: string;
  /** JSON Schema advertised to the planner and returned by `GET /ai/tools`. */
  parameters: Record<string, unknown>;
  risk: ToolRisk;
  /** Hard ceiling enforced by the registry with Promise.race. */
  timeoutMs: number;
  /** Maximum accepted argument payload, in characters. */
  maxArgumentLength: number;
  /** Every tool invocation is audited when true (all of them, in Phase 10). */
  audit: boolean;
  /** Reject the call before any side effect. Runs before `validate`. */
  authorize?: (args: unknown, ctx: ToolContext) => void;
  /** Parse and bound the arguments. Throws `ToolError` on anything malformed. */
  validate: (raw: unknown) => P;
  execute: (args: P, ctx: ToolContext) => Promise<ToolResult>;
};

/**
 * A tool with its argument type erased, so a registry can hold tools with
 * different argument shapes. `validate` narrows the untrusted input before
 * `execute` ever sees it, which is what makes the cast sound.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyToolDefinition = ToolDefinition<any>;
