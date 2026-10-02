import { AuditService } from '../security/audit.service';
import { AnyToolDefinition, ToolContext, ToolResult } from './tools/tool.types';
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
export declare class AiToolsRegistry {
    private readonly audit;
    private readonly log;
    private readonly tools;
    constructor(audit: AuditService);
    register(definition: AnyToolDefinition): void;
    has(name: string): boolean;
    get(name: string): AnyToolDefinition | undefined;
    /** Catalogue for `GET /ai/tools`. */
    list(): AiToolDefinition[];
    /**
     * Names the planner is allowed to emit for this agent. An empty allow-list
     * means the agent has no tools at all: capability is opt-in, never implicit.
     */
    allowedFor(allowList: readonly string[]): AnyToolDefinition[];
    invoke(name: string, rawArgs: unknown, ctx: ToolContext): Promise<ToolInvocation>;
}
