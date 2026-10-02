export type ShellCommandValidationResult = {
    allowed: boolean;
    command: string;
    normalized: string;
    tokens: string[];
    reason?: string;
};
export type ShellCommandExecutionResult = {
    ok: boolean;
    blocked: boolean;
    command: string;
    stdout: string;
    stderr: string;
    exitCode: number | null;
    reason?: string;
};
export declare class AdminShellService {
    private resolveExecutable;
    validateCommand(raw: string): ShellCommandValidationResult;
    execute(raw: string): Promise<ShellCommandExecutionResult>;
}
