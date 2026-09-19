export class ApiError extends Error {
  constructor(
    readonly message: string,
    readonly status: number,
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
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