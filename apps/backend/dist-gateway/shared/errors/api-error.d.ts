export declare class ApiError extends Error {
    readonly message: string;
    readonly status: number;
    readonly code: string;
    readonly details?: unknown | undefined;
    constructor(message: string, status: number, code: string, details?: unknown | undefined);
}
export type ErrorFormat = {
    error: {
        code: string;
        message: string;
        status: number;
        requestId: string;
        path: string;
        timestamp: string;
        details?: unknown;
    };
};
