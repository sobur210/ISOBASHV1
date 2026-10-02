export declare class CreateAgentDto {
    name: string;
    description?: string;
    instructions?: string;
    /** `provider` or `provider:model`; omitted lets the Phase 9 router decide. */
    providerModel?: string;
    maxSteps?: number;
    toolNames?: string[];
    memoryEnabled?: boolean | string;
    projectId?: number;
}
export declare class UpdateAgentDto {
    name?: string;
    description?: string;
    instructions?: string;
    providerModel?: string;
    maxSteps?: number;
    toolNames?: string[];
    memoryEnabled?: boolean | string;
    projectId?: number | null;
}
export declare class StartAgentRunDto {
    input: string;
}
