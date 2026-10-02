"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AllExceptionsFilter = void 0;
const common_1 = require("@nestjs/common");
const api_error_1 = require("./api-error");
const provider_types_1 = require("../../ai/provider.types");
function requestIdFrom(req) {
    const header = req?.headers['x-request-id'];
    return typeof header === 'string' && header ? header : 'unknown';
}
let AllExceptionsFilter = class AllExceptionsFilter {
    logger = new common_1.Logger('Exceptions');
    catch(exception, host) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse();
        const request = ctx.getRequest();
        let status = common_1.HttpStatus.INTERNAL_SERVER_ERROR;
        let code = 'INTERNAL_ERROR';
        let message = 'An unexpected error occurred.';
        let details;
        if (exception instanceof api_error_1.ApiError) {
            status = exception.status;
            code = exception.code;
            message = exception.message;
            details = exception.details;
        }
        else if (exception instanceof provider_types_1.AiProviderError) {
            status =
                exception.code === 'NO_PROVIDER_AVAILABLE' || exception.code === 'NO_HEALTHY_PROVIDER'
                    ? common_1.HttpStatus.SERVICE_UNAVAILABLE
                    : common_1.HttpStatus.BAD_GATEWAY;
            code = exception.code;
            message = exception.message;
            details = { provider: exception.provider };
        }
        else if (exception instanceof common_1.HttpException) {
            status = exception.getStatus();
            const body = exception.getResponse();
            if (status === common_1.HttpStatus.NOT_FOUND) {
                code = 'NOT_FOUND';
                message = exception.message;
            }
            else if (status === common_1.HttpStatus.UNAUTHORIZED) {
                code = 'UNAUTHORIZED';
                message = exception.message;
            }
            else if (status === common_1.HttpStatus.FORBIDDEN) {
                code = 'FORBIDDEN';
                message = exception.message;
            }
            else if (status === common_1.HttpStatus.CONFLICT) {
                code = 'CONFLICT';
                message = exception.message;
            }
            else if (status === common_1.HttpStatus.TOO_MANY_REQUESTS) {
                code = 'RATE_LIMITED';
                message = exception.message;
            }
            else if (status === common_1.HttpStatus.PAYLOAD_TOO_LARGE) {
                // Raised by the upload interceptor while the body is still being read.
                // A caller needs to know it was the size, not a validation slip.
                code = 'FILE_TOO_LARGE';
                message =
                    typeof body === 'object' && body !== null && 'message' in body
                        ? String(body.message ?? exception.message)
                        : exception.message;
            }
            else if (typeof body === 'object' && body !== null && 'message' in body) {
                const raw = body.message;
                message = Array.isArray(raw) ? raw.join(', ') : String(raw ?? exception.message);
                code = 'VALIDATION_FAILED';
                details = Array.isArray(raw) ? raw : undefined;
            }
            else {
                message = exception.message;
                code = exception.name;
            }
        }
        else if (exception instanceof Error) {
            message = exception.message;
            if (message === 'Cannot GET' || message.startsWith('Cannot ')) {
                status = common_1.HttpStatus.NOT_FOUND;
                code = 'NOT_FOUND';
            }
        }
        if (status >= 500) {
            this.logger.error(`${request.method} ${request.url} -> ${status} ${code}: ${message}`, exception instanceof Error ? exception.stack : undefined);
        }
        const format = {
            error: {
                code,
                message,
                status,
                requestId: requestIdFrom(request),
                path: request.url,
                timestamp: new Date().toISOString(),
                details,
            },
        };
        response.status(status).json(format);
    }
};
exports.AllExceptionsFilter = AllExceptionsFilter;
exports.AllExceptionsFilter = AllExceptionsFilter = __decorate([
    (0, common_1.Catch)()
], AllExceptionsFilter);
//# sourceMappingURL=all-exceptions.filter.js.map