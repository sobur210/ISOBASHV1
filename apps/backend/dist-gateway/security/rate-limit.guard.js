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
exports.RateLimitGuard = exports.RateLimit = exports.RATE_LIMIT_KEY = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const rate_limit_service_1 = require("./rate-limit.service");
exports.RATE_LIMIT_KEY = 'rateLimit';
const RateLimit = (options) => (0, common_1.SetMetadata)(exports.RATE_LIMIT_KEY, options);
exports.RateLimit = RateLimit;
let RateLimitGuard = class RateLimitGuard {
    reflector;
    rateLimit;
    constructor(reflector, rateLimit) {
        this.reflector = reflector;
        this.rateLimit = rateLimit;
    }
    async canActivate(context) {
        const options = this.reflector.getAllAndOverride(exports.RATE_LIMIT_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (!options)
            return true;
        const request = context.switchToHttp().getRequest();
        const response = context.switchToHttp().getResponse();
        const forwarded = request.headers['x-forwarded-for'];
        const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim() || request.ip || 'unknown';
        const bucket = `auth:${request.method}:${request.path.split('?')[0]}:${ip}:${options.limit}:${options.windowMs}`;
        const result = await this.rateLimit.hit(bucket, options.limit, options.windowMs);
        response.setHeader('x-ratelimit-limit', String(options.limit));
        response.setHeader('x-ratelimit-remaining', String(result.remaining));
        if (!result.allowed) {
            response.setHeader('retry-after', String(Math.ceil(result.retryAfterMs / 1000)));
            throw new common_1.HttpException('Too many requests. Please retry shortly.', common_1.HttpStatus.TOO_MANY_REQUESTS);
        }
        return true;
    }
};
exports.RateLimitGuard = RateLimitGuard;
exports.RateLimitGuard = RateLimitGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.Reflector,
        rate_limit_service_1.RateLimitService])
], RateLimitGuard);
//# sourceMappingURL=rate-limit.guard.js.map