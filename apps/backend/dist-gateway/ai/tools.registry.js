"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiToolsRegistry = void 0;
const common_1 = require("@nestjs/common");
const audit_service_1 = require("../security/audit.service");
const builtin_tools_1 = require("./tools/builtin-tools");
const tool_types_1 = require("./tools/tool.types");
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
let AiToolsRegistry = class AiToolsRegistry {
    audit;
    log = new common_1.Logger('Tools');
    tools = new Map();
    constructor(audit) {
        this.audit = audit;
        for (const tool of (0, builtin_tools_1.builtinTools)()) {
            this.register(tool);
        }
    }
    register(definition) {
        this.tools.set(definition.name, definition);
    }
    has(name) {
        return this.tools.has(name);
    }
    get(name) {
        return this.tools.get(name);
    }
    /** Catalogue for `GET /ai/tools`. */
    list() {
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
    allowedFor(allowList) {
        return allowList
            .map((name) => this.tools.get(name))
            .filter((tool) => Boolean(tool));
    }
    async invoke(name, rawArgs, ctx) {
        const tool = this.tools.get(name);
        if (!tool) {
            throw new tool_types_1.ToolError(`Unknown tool "${name}".`, 'UNKNOWN_TOOL');
        }
        if (ctx.signal.aborted) {
            throw new tool_types_1.ToolError('Run cancelled before the tool started.', 'RUN_CANCELLED');
        }
        const serialized = safeStringify(rawArgs);
        if (serialized.length > tool.maxArgumentLength) {
            throw new tool_types_1.ToolError(`Arguments for "${name}" exceed ${tool.maxArgumentLength} characters.`, 'RESOURCE_LIMIT');
        }
        const started = Date.now();
        let outcome = 'succeeded';
        let failureCode;
        try {
            tool.authorize?.(rawArgs, ctx);
            const args = tool.validate(rawArgs);
            const result = await withTimeout(tool.execute(args, ctx), tool.timeoutMs, name);
            if (ctx.signal.aborted) {
                throw new tool_types_1.ToolError('Run cancelled while the tool was executing.', 'RUN_CANCELLED');
            }
            return { tool: name, risk: tool.risk, durationMs: Date.now() - started, result };
        }
        catch (error) {
            outcome = 'failed';
            failureCode = error instanceof tool_types_1.ToolError ? error.code : 'TOOL_FAILED';
            const message = error instanceof Error ? error.message : `Tool "${name}" failed.`;
            this.log.warn(`Tool ${name} failed for run ${ctx.runId}: ${failureCode} ${message}`);
            throw error instanceof tool_types_1.ToolError ? error : new tool_types_1.ToolError(message, failureCode);
        }
        finally {
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
};
exports.AiToolsRegistry = AiToolsRegistry;
exports.AiToolsRegistry = AiToolsRegistry = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [audit_service_1.AuditService])
], AiToolsRegistry);
function withTimeout(promise, timeoutMs, label) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new tool_types_1.ToolError(`Tool "${label}" exceeded its ${timeoutMs}ms budget.`, 'TOOL_TIMEOUT'));
        }, timeoutMs);
        promise
            .then((value) => {
            clearTimeout(timer);
            resolve(value);
        })
            .catch((error) => {
            clearTimeout(timer);
            reject(error);
        });
    });
}
function safeStringify(value) {
    if (value === undefined)
        return '';
    try {
        return JSON.stringify(value) ?? '';
    }
    catch {
        return String(value);
    }
}
//# sourceMappingURL=tools.registry.js.map