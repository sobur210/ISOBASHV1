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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SystemHealthService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const queue_service_1 = require("../queues/queue.service");
const inject_config_1 = require("../shared/config/inject-config");
const HTTP_TIMEOUT_MS = 5_000;
function timeoutSignal(ms) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    controller.signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
    return controller.signal;
}
function withTimeout(promise, ms, label) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms.`)), ms);
        promise.then((value) => {
            clearTimeout(timer);
            resolve(value);
        }, (error) => {
            clearTimeout(timer);
            reject(error);
        });
    });
}
let SystemHealthService = class SystemHealthService {
    config;
    prisma;
    queue;
    logger = new common_1.Logger('SystemHealth');
    constructor(config, prisma, queue) {
        this.config = config;
        this.prisma = prisma;
        this.queue = queue;
    }
    async checkAll() {
        const started = Date.now();
        const [frontend, database, redis, jobQueue, ollama] = await Promise.all([
            this.checkFrontend(),
            this.checkDatabase(),
            this.checkRedis(),
            this.checkJobQueue(),
            this.checkOllama(),
        ]);
        const components = [
            frontend,
            {
                name: 'backend',
                status: 'ok',
                detail: 'API responding (HTTP 200).',
                latencyMs: Date.now() - started,
            },
            database,
            redis,
            jobQueue,
            ollama,
        ];
        const allOk = components.every((component) => component.status === 'ok');
        return {
            status: allOk ? 'ok' : 'degraded',
            service: 'isobash-api',
            timestamp: new Date().toISOString(),
            components,
        };
    }
    async checkFrontend() {
        const started = Date.now();
        try {
            const response = await fetch(this.config.webUrl, { signal: timeoutSignal(HTTP_TIMEOUT_MS) });
            return {
                name: 'frontend',
                status: response.ok ? 'ok' : 'error',
                detail: response.ok ? 'Next.js is serving the web app.' : `Frontend returned HTTP ${response.status}.`,
                latencyMs: Date.now() - started,
            };
        }
        catch (error) {
            this.logger.error(`Frontend health check failed: ${error instanceof Error ? error.message : error}`);
            return {
                name: 'frontend',
                status: 'error',
                detail: error instanceof Error ? error.message : 'unreachable',
                latencyMs: Date.now() - started,
            };
        }
    }
    async checkDatabase() {
        const started = Date.now();
        try {
            await withTimeout(this.prisma.$queryRaw `SELECT 1`, HTTP_TIMEOUT_MS, 'Database');
            return {
                name: 'database',
                status: 'ok',
                detail: 'PostgreSQL reachable (SELECT 1).',
                latencyMs: Date.now() - started,
            };
        }
        catch (error) {
            this.logger.error(`Database health check failed: ${error instanceof Error ? error.message : error}`);
            return {
                name: 'database',
                status: 'error',
                detail: error instanceof Error ? error.message : 'unreachable',
                latencyMs: Date.now() - started,
            };
        }
    }
    async checkRedis() {
        const started = Date.now();
        try {
            const pong = await withTimeout(this.queue.ping(), HTTP_TIMEOUT_MS, 'Redis');
            const ok = pong === 'PONG';
            return {
                name: 'redis',
                status: ok ? 'ok' : 'error',
                detail: ok ? 'Redis reachable (PONG).' : 'Redis returned an unexpected response.',
                latencyMs: Date.now() - started,
            };
        }
        catch (error) {
            this.logger.error(`Redis health check failed: ${error instanceof Error ? error.message : error}`);
            return {
                name: 'redis',
                status: 'error',
                detail: error instanceof Error ? error.message : 'unreachable',
                latencyMs: Date.now() - started,
            };
        }
    }
    async checkJobQueue() {
        const started = Date.now();
        try {
            const [counts, workers] = await Promise.all([
                withTimeout(this.queue.getJobCounts(), HTTP_TIMEOUT_MS, 'Job queue'),
                withTimeout(this.queue.getWorkers(), HTTP_TIMEOUT_MS, 'Job queue'),
            ]);
            const workerCount = workers?.length ?? 0;
            const detailParts = [
                `worker(s): ${workerCount}`,
                `waiting ${counts.waiting ?? 0}`,
                `active ${counts.active ?? 0}`,
                `delayed ${counts.delayed ?? 0}`,
                `completed ${counts.completed ?? 0}`,
                `failed ${counts.failed ?? 0}`,
            ];
            let detail = detailParts.join(' · ');
            if (workerCount === 0) {
                detail = `No worker is connected to the queue. ${detail}`;
            }
            return {
                name: 'job-queue',
                status: workerCount === 0 ? 'error' : 'ok',
                detail,
                latencyMs: Date.now() - started,
            };
        }
        catch (error) {
            this.logger.error(`Job queue health check failed: ${error instanceof Error ? error.message : error}`);
            return {
                name: 'job-queue',
                status: 'error',
                detail: error instanceof Error ? error.message : 'unreachable',
                latencyMs: Date.now() - started,
            };
        }
    }
    async checkOllama() {
        const started = Date.now();
        try {
            const response = await fetch(`${this.config.ollama.baseUrl}/api/tags`, {
                signal: timeoutSignal(HTTP_TIMEOUT_MS),
            });
            if (!response.ok) {
                return {
                    name: 'ollama',
                    status: 'error',
                    detail: `Ollama returned HTTP ${response.status}.`,
                    latencyMs: Date.now() - started,
                };
            }
            const payload = (await response.json());
            const modelCount = payload.models?.length ?? 0;
            return {
                name: 'ollama',
                status: 'ok',
                detail: `Ollama reachable (HTTP 200) · ${modelCount} model(s) installed.`,
                latencyMs: Date.now() - started,
            };
        }
        catch (error) {
            this.logger.error(`Ollama health check failed: ${error instanceof Error ? error.message : error}`);
            return {
                name: 'ollama',
                status: 'error',
                detail: error instanceof Error ? error.message : 'Ollama is unreachable.',
                latencyMs: Date.now() - started,
            };
        }
    }
};
exports.SystemHealthService = SystemHealthService;
exports.SystemHealthService = SystemHealthService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, inject_config_1.InjectConfig)()),
    __metadata("design:paramtypes", [Object, prisma_service_1.PrismaService,
        queue_service_1.QueueService])
], SystemHealthService);
//# sourceMappingURL=system-health.service.js.map