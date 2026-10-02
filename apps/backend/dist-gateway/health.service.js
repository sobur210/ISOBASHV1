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
exports.HealthService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("./prisma/prisma.service");
const queue_service_1 = require("./queues/queue.service");
let HealthService = class HealthService {
    prisma;
    queue;
    logger = new common_1.Logger('Health');
    constructor(prisma, queue) {
        this.prisma = prisma;
        this.queue = queue;
    }
    async check() {
        const [database, redis] = await Promise.all([this.checkDatabase(), this.checkRedis()]);
        const allOk = database.status === 'ok' && redis.status === 'ok';
        return {
            status: allOk ? 'ok' : 'degraded',
            service: 'isobash-api',
            timestamp: new Date().toISOString(),
            components: [database, redis],
        };
    }
    async checkDatabase() {
        try {
            await this.prisma.$queryRaw `SELECT 1`;
            return { name: 'database', status: 'ok' };
        }
        catch (error) {
            this.logger.error(`Database health check failed: ${error instanceof Error ? error.message : error}`);
            return { name: 'database', status: 'error', detail: error instanceof Error ? error.message : 'unreachable' };
        }
    }
    async checkRedis() {
        try {
            const pong = await this.queue.ping();
            return pong === 'PONG' ? { name: 'redis', status: 'ok' } : { name: 'redis', status: 'error', detail: 'unexpected response' };
        }
        catch (error) {
            this.logger.error(`Redis health check failed: ${error instanceof Error ? error.message : error}`);
            return { name: 'redis', status: 'error', detail: error instanceof Error ? error.message : 'unreachable' };
        }
    }
};
exports.HealthService = HealthService;
exports.HealthService = HealthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        queue_service_1.QueueService])
], HealthService);
//# sourceMappingURL=health.service.js.map