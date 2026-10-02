"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiError = void 0;
class ApiError extends Error {
    message;
    status;
    code;
    details;
    constructor(message, status, code, details) {
        super(message);
        this.message = message;
        this.status = status;
        this.code = code;
        this.details = details;
        this.name = 'ApiError';
    }
}
exports.ApiError = ApiError;
//# sourceMappingURL=api-error.js.map