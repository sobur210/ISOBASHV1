"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequestLoggingMiddleware = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
let RequestLoggingMiddleware = class RequestLoggingMiddleware {
    logger = new common_1.Logger('HTTP');
    use(req, res, next) {
        const requestId = (0, crypto_1.randomUUID)();
        req.headers['x-request-id'] = requestId;
        res.setHeader('x-request-id', requestId);
        const started = Date.now();
        res.on('finish', () => {
            const durationMs = Date.now() - started;
            const level = res.statusCode >= 500 ? this.logger.error.bind(this.logger) : this.logger.log.bind(this.logger);
            const line = JSON.stringify({
                requestId,
                method: req.method,
                url: req.originalUrl,
                status: res.statusCode,
                durationMs,
                userAgent: req.headers['user-agent'] ?? undefined,
            });
            level(`${line}`);
        });
        next();
    }
};
exports.RequestLoggingMiddleware = RequestLoggingMiddleware;
exports.RequestLoggingMiddleware = RequestLoggingMiddleware = __decorate([
    (0, common_1.Injectable)()
], RequestLoggingMiddleware);
//# sourceMappingURL=request-logging.middleware.js.map