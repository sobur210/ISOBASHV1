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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RateLimitService = void 0;
const common_1 = require("@nestjs/common");
const ioredis_1 = __importDefault(require("ioredis"));
const inject_config_1 = require("../shared/config/inject-config");
let RateLimitService = class RateLimitService {
    logger = new common_1.Logger('RateLimit');
    redis;
    redisDown = false;
    nextRedisProbeAt = 0;
    memory = new Map();
    constructor(config) {
        this.redis = new ioredis_1.default(config.redisUrl, {
            maxRetriesPerRequest: 1,
            connectTimeout: 2000,
            retryStrategy: () => null,
        });
        this.redis.on('error', () => {
            if (!this.redisDown) {
                this.redisDown = true;
                this.logger.warn('Redis rate limits unavailable; falling back to in-memory limiting.');
            }
        });
    }
    /**
     * A single `retryStrategy: () => null` client never reconnects on its own, so a
     * Redis outage would silently pin this process to in-memory limiting until it is
     * restarted. Probe at most once every 30s and restore the Redis path when the
     * server is back, so rate limits stay shared across instances after recovery.
     */
    async redisRecovered() {
        if (!this.redis)
            return false;
        const now = Date.now();
        if (now < this.nextRedisProbeAt)
            return false;
        this.nextRedisProbeAt = now + 30_000;
        try {
            const pong = await this.redis.ping();
            if (pong === 'PONG') {
                this.redisDown = false;
                this.logger.log('Redis rate limits restored.');
                return true;
            }
        }
        catch {
            // Still down; the next probe happens after the cooldown.
        }
        return false;
    }
    async hit(bucket, limit, windowMs) {
        if (this.redis && this.redisDown) {
            await this.redisRecovered();
        }
        if (this.redis && !this.redisDown) {
            try {
                const key = `rl:${bucket}`;
                const count = await this.redis.incr(key);
                if (count === 1) {
                    await this.redis.expire(key, Math.ceil(windowMs / 1000));
                }
                const ttl = await this.redis.ttl(key);
                return {
                    allowed: count <= limit,
                    remaining: Math.max(0, limit - count),
                    retryAfterMs: Math.max(0, ttl) * 1000,
                };
            }
            catch (error) {
                this.redisDown = true;
                this.logger.warn(`Rate limit redis call failed: ${error instanceof Error ? error.message : error}`);
            }
        }
        const now = Date.now();
        let record = this.memory.get(bucket);
        if (!record || record.resetAt <= now) {
            record = { count: 0, resetAt: now + windowMs };
            this.memory.set(bucket, record);
        }
        record.count += 1;
        if (record.count > 1_000_000) {
            record.count = 1;
            record.resetAt = now + windowMs;
        }
        return {
            allowed: record.count <= limit,
            remaining: Math.max(0, limit - record.count),
            retryAfterMs: Math.max(0, record.resetAt - now),
        };
    }
    async onModuleDestroy() {
        try {
            await this.redis?.quit();
        }
        catch {
            // best-effort shutdown
        }
    }
};
exports.RateLimitService = RateLimitService;
exports.RateLimitService = RateLimitService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, inject_config_1.InjectConfig)()),
    __metadata("design:paramtypes", [Object])
], RateLimitService);
//# sourceMappingURL=rate-limit.service.js.map