import { AnyToolDefinition, ToolDefinition } from './tool.types';
/** Current server time. The result is the API host's clock, not a model guess. */
export declare const datetimeNowTool: ToolDefinition;
/** Arithmetic with a real parser; no JavaScript evaluation of model output. */
export declare const mathEvaluateTool: ToolDefinition<{
    expression: string;
}>;
/** Keyword search over the caller's own persisted memory. Ownership enforced. */
export declare const memorySearchTool: ToolDefinition<{
    query: string;
    limit: number;
}>;
/** Persist a memory. Scoped to the caller and, when set, to the agent. */
export declare const memoryWriteTool: ToolDefinition<{
    content: string;
    kind: string;
}>;
/** Create a task in the agent's project. Project ownership is re-checked here. */
export declare const taskCreateTool: ToolDefinition<{
    title: string;
    description: string;
}>;
export declare function builtinTools(): AnyToolDefinition[];
