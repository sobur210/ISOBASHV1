"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.taskCreateTool = exports.memoryWriteTool = exports.memorySearchTool = exports.mathEvaluateTool = exports.datetimeNowTool = void 0;
exports.builtinTools = builtinTools;
const tool_types_1 = require("./tool.types");
const math_1 = require("./math");
const MAX_CONTENT_LENGTH = 2000;
function requireString(raw, field, maxLength) {
    if (typeof raw !== 'string' || !raw.trim()) {
        throw new tool_types_1.ToolError(`"${field}" must be a non-empty string.`, 'INVALID_ARGUMENTS');
    }
    if (raw.length > maxLength) {
        throw new tool_types_1.ToolError(`"${field}" exceeds ${maxLength} characters.`, 'INVALID_ARGUMENTS');
    }
    return raw.trim();
}
function requireInteger(raw, field, min, max) {
    if (typeof raw !== 'number' || !Number.isInteger(raw)) {
        throw new tool_types_1.ToolError(`"${field}" must be an integer.`, 'INVALID_ARGUMENTS');
    }
    if (raw < min || raw > max) {
        throw new tool_types_1.ToolError(`"${field}" must be between ${min} and ${max}.`, 'INVALID_ARGUMENTS');
    }
    return raw;
}
const MEMORY_KINDS = new Set(['FACT', 'PREFERENCE', 'SUMMARY', 'NOTE']);
/** Current server time. The result is the API host's clock, not a model guess. */
exports.datetimeNowTool = {
    name: 'datetime.now',
    description: 'Return the current server date and time in ISO 8601 (UTC).',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    risk: 'low',
    timeoutMs: 2_000,
    maxArgumentLength: 2_000,
    audit: true,
    validate: () => ({}),
    execute: async () => {
        const now = new Date();
        return {
            output: `Current server time is ${now.toISOString()}.`,
            data: { iso: now.toISOString(), epochMs: now.getTime() },
        };
    },
};
/** Arithmetic with a real parser; no JavaScript evaluation of model output. */
exports.mathEvaluateTool = {
    name: 'math.evaluate',
    description: 'Evaluate an arithmetic expression (+ - * / % ^, parentheses, and sqrt/abs/round/floor/ceil/min/max/pow/log/exp).',
    parameters: {
        type: 'object',
        properties: { expression: { type: 'string', description: 'Arithmetic expression, e.g. "(128 * 3) / 4".' } },
        required: ['expression'],
        additionalProperties: false,
    },
    risk: 'low',
    timeoutMs: 2_000,
    maxArgumentLength: 500,
    audit: true,
    validate: (raw) => {
        const args = (raw ?? {});
        return { expression: requireString(args.expression, 'expression', 200) };
    },
    execute: async (args) => {
        const { expression, result } = (0, math_1.evaluateExpression)(args.expression);
        return { output: `${expression} = ${result}`, data: { expression, result } };
    },
};
/** Keyword search over the caller's own persisted memory. Ownership enforced. */
exports.memorySearchTool = {
    name: 'memory.search',
    description: "Search the user's saved memories (facts, preferences, notes) by keyword.",
    parameters: {
        type: 'object',
        properties: {
            query: { type: 'string', description: 'Keywords to search for.' },
            limit: { type: 'integer', description: 'Maximum memories to return (1-20).', default: 5 },
        },
        required: ['query'],
        additionalProperties: false,
    },
    risk: 'low',
    timeoutMs: 5_000,
    maxArgumentLength: 500,
    audit: true,
    validate: (raw) => {
        const args = (raw ?? {});
        const limit = args.limit === undefined ? 5 : requireInteger(args.limit, 'limit', 1, 20);
        return { query: requireString(args.query, 'query', 200), limit };
    },
    execute: async (args, ctx) => {
        const rows = await ctx.deps.prisma.memoryEntry.findMany({
            where: {
                userId: ctx.actor.userId,
                content: { contains: args.query, mode: 'insensitive' },
            },
            orderBy: { updatedAt: 'desc' },
            take: args.limit,
            select: { id: true, kind: true, content: true, updatedAt: true },
        });
        await Promise.all(rows.map((row) => ctx.deps.prisma.memoryEntry.update({ where: { id: row.id }, data: { lastAccessedAt: new Date() } })));
        if (rows.length === 0) {
            return { output: `No stored memory matches "${args.query}".`, data: { matches: 0 } };
        }
        return {
            output: rows.map((row) => `- [${row.kind}] ${row.content}`).join('\n'),
            data: { matches: rows.length, ids: rows.map((row) => row.id) },
        };
    },
};
/** Persist a memory. Scoped to the caller and, when set, to the agent. */
exports.memoryWriteTool = {
    name: 'memory.write',
    description: 'Save a durable fact, preference or note to the user memory store for later recall.',
    parameters: {
        type: 'object',
        properties: {
            content: { type: 'string', description: 'The statement to remember.' },
            kind: { type: 'string', enum: ['FACT', 'PREFERENCE', 'SUMMARY', 'NOTE'], default: 'FACT' },
        },
        required: ['content'],
        additionalProperties: false,
    },
    risk: 'medium',
    timeoutMs: 5_000,
    maxArgumentLength: MAX_CONTENT_LENGTH,
    audit: true,
    validate: (raw) => {
        const args = (raw ?? {});
        const kind = args.kind === undefined ? 'FACT' : requireString(args.kind, 'kind', 20).toUpperCase();
        if (!MEMORY_KINDS.has(kind)) {
            throw new tool_types_1.ToolError(`"kind" must be one of ${[...MEMORY_KINDS].join(', ')}.`, 'INVALID_ARGUMENTS');
        }
        return { content: requireString(args.content, 'content', MAX_CONTENT_LENGTH), kind };
    },
    execute: async (args, ctx) => {
        const entry = await ctx.deps.prisma.memoryEntry.create({
            data: {
                userId: ctx.actor.userId,
                agentId: ctx.agentId,
                projectId: ctx.projectId,
                kind: args.kind,
                content: args.content,
                source: 'agent_tool',
                sourceId: ctx.runId,
            },
            select: { id: true },
        });
        return { output: `Saved memory ${entry.id}.`, data: { id: entry.id, kind: args.kind } };
    },
};
/** Create a task in the agent's project. Project ownership is re-checked here. */
exports.taskCreateTool = {
    name: 'task.create',
    description: 'Create a task in the current project so the work is tracked outside the conversation.',
    parameters: {
        type: 'object',
        properties: {
            title: { type: 'string', description: 'Short task title.' },
            description: { type: 'string', description: 'Optional detail.' },
        },
        required: ['title'],
        additionalProperties: false,
    },
    risk: 'medium',
    timeoutMs: 5_000,
    maxArgumentLength: MAX_CONTENT_LENGTH,
    audit: true,
    authorize: (_args, ctx) => {
        if (ctx.projectId === null) {
            throw new tool_types_1.ToolError('This agent is not attached to a project, so tasks cannot be created.', 'TOOL_NOT_APPLICABLE');
        }
    },
    validate: (raw) => {
        const args = (raw ?? {});
        const description = args.description === undefined ? '' : requireString(args.description, 'description', MAX_CONTENT_LENGTH);
        return { title: requireString(args.title, 'title', 200), description };
    },
    execute: async (args, ctx) => {
        const project = await ctx.deps.prisma.project.findFirst({
            where: { id: ctx.projectId, ownerId: ctx.actor.userId },
            select: { id: true },
        });
        if (!project) {
            throw new tool_types_1.ToolError('The project is not available to this user.', 'FORBIDDEN');
        }
        const last = await ctx.deps.prisma.task.findFirst({
            where: { projectId: project.id },
            orderBy: { order: 'desc' },
            select: { order: true },
        });
        const task = await ctx.deps.prisma.task.create({
            data: {
                projectId: project.id,
                title: args.title,
                description: args.description || null,
                order: (last?.order ?? 0) + 1,
                agentRunId: ctx.runId,
            },
            select: { id: true, title: true },
        });
        return { output: `Created task #${task.id} "${task.title}".`, data: { id: task.id, title: task.title } };
    },
};
function builtinTools() {
    return [exports.datetimeNowTool, exports.mathEvaluateTool, exports.memorySearchTool, exports.memoryWriteTool, exports.taskCreateTool];
}
//# sourceMappingURL=builtin-tools.js.map