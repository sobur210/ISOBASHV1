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
exports.QueueService = exports.RedisUnavailableError = exports.DEFAULT_QUEUE_NAME = void 0;
const common_1 = require("@nestjs/common");
const bullmq_1 = require("bullmq");
const ioredis_1 = __importDefault(require("ioredis"));
const inject_config_1 = require("../shared/config/inject-config");
const DEFAULT_JOB_OPTIONS = {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: { age: 3600, count: 1000 },
    removeOnFail: { age: 86400 },
};
/** The general-purpose queue. Work any process can do, and nothing that only one can. */
exports.DEFAULT_QUEUE_NAME = 'isobash-queue';
const STARTUP_PING_TIMEOUT_MS = Number(process.env.REDIS_STARTUP_TIMEOUT_MS || 10_000);
const COMMAND_TIMEOUT_MS = Number(process.env.REDIS_COMMAND_TIMEOUT_MS || 5_000);
class RedisUnavailableError extends Error {
    constructor(operation, cause) {
        super(`Redis is unavailable for "${operation}": ${cause instanceof Error ? cause.message : String(cause)}. ` +
            'Queue operations are failing; fix Redis (see docs/LOCAL-DEVELOPMENT.md).');
        this.name = 'RedisUnavailableError';
    }
}
exports.RedisUnavailableError = RedisUnavailableError;
function withTimeout(promise, ms, operation) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new RedisUnavailableError(operation, new Error(`no response within ${ms}ms`)));
        }, ms);
        promise
            .then((value) => {
            clearTimeout(timer);
            resolve(value);
        })
            .catch((error) => {
            clearTimeout(timer);
            reject(error instanceof RedisUnavailableError ? error : new RedisUnavailableError(operation, error));
        });
    });
}
let QueueService = class QueueService {
    logger = new common_1.Logger('Queue');
    connection;
    /**
     * Every queue this process has touched, keyed by name.
     *
     * Several queues exist because they are not interchangeable: work that only one
     * kind of process can do must not be visible to the others (see
     * `video-render-job.ts`). They are tracked together so the health panel still
     * reports one honest picture of what is waiting, instead of a queue that always
     * looks idle because the real work went somewhere else.
     */
    queues = new Map();
    workers = [];
    config;
    constructor(config) {
        this.config = config;
        this.connection = new ioredis_1.default(config.redisUrl, {
            maxRetriesPerRequest: null,
            enableReadyCheck: true,
            connectTimeout: 5_000,
            retryStrategy: (attempt) => Math.min(attempt * 500, 5_000),
        });
        this.connection.on('error', (error) => {
            this.logger.warn(`Redis connection error: ${error.message}`);
        });
        this.queues.set(exports.DEFAULT_QUEUE_NAME, this.newQueue(exports.DEFAULT_QUEUE_NAME));
    }
    /**
     * Bounded startup probe. `maxRetriesPerRequest: null` means a `ping()` against a
     * dead Redis never settles; awaiting it inside `onModuleInit` would block Nest's
     * init hook forever and the HTTP server would never bind its port (the API then
     * looks "unreachable" with no error anywhere). We wait a bounded amount of time,
     * log the real failure, and let the app boot in a degraded state so `/health`
     * reports the truth instead of the process dying silently.
     */
    async onModuleInit() {
        try {
            await withTimeout(this.connection.ping(), STARTUP_PING_TIMEOUT_MS, 'startup ping');
            this.logger.log('Redis connection ready');
        }
        catch (error) {
            this.logger.error(`Redis is not reachable at startup: ${error instanceof Error ? error.message : String(error)}. ` +
                'The API will start in a degraded state; queue-backed features will fail until Redis is running.');
        }
    }
    getQueue() {
        return this.queues.get(exports.DEFAULT_QUEUE_NAME);
    }
    /**
     * The queue for a name, created on first use.
     *
     * Named queues are how a job is offered only to the processes that can do it, so
     * the name is part of the contract rather than an implementation detail: a producer
     * and its workers have to agree on it, which is why callers import the name from
     * the module that owns the job.
     */
    queueNamed(name) {
        const existing = this.queues.get(name);
        if (existing)
            return existing;
        const queue = this.newQueue(name);
        this.queues.set(name, queue);
        return queue;
    }
    newQueue(name) {
        return new bullmq_1.Queue(name, {
            connection: this.connection,
            defaultJobOptions: DEFAULT_JOB_OPTIONS,
        });
    }
    async addJob(name, data, options, queueName = exports.DEFAULT_QUEUE_NAME) {
        return withTimeout(this.queueNamed(queueName).add(name, data, options), COMMAND_TIMEOUT_MS, `addJob(${name})`);
    }
    /**
     * A worker for this queue, on its own Redis connection.
     *
     * A BullMQ `Worker` needs `maxRetriesPerRequest: null` on *its* connection, and
     * sharing the producer's connection with a worker that can hold it for minutes at
     * a time would stall every `addJob` behind a long-running render. The full Redis
     * lifecycle stays here so callers never touch a connection, only a processor.
     *
     * The worker is recorded so shutdown closes it; BullMQ workers should always be
     * closed before `quit()` on their connection.
     */
    createWorker(name, processor, options) {
        if (!this.isReady()) {
            this.logger.warn(`Redis is not ready; the ${name} worker will not start.`);
            return null;
        }
        const connection = new ioredis_1.default(this.config.redisUrl, {
            maxRetriesPerRequest: null,
            enableReadyCheck: true,
            connectTimeout: 5_000,
            retryStrategy: (attempt) => Math.min(attempt * 500, 5_000),
        });
        connection.on('error', (error) => {
            this.logger.warn(`Worker Redis connection error: ${error.message}`);
        });
        const worker = new bullmq_1.Worker(name, processor, {
            connection,
            concurrency: options?.concurrency ?? 1,
        });
        worker.on('error', (error) => {
            this.logger.error(`BullMQ worker ${name} error: ${error.message}`);
        });
        this.workers.push(worker);
        // A queue this process only consumes still has to be reported by the health
        // panel, or a waiting render is invisible exactly when it is stuck.
        this.queueNamed(name);
        return worker;
    }
    /** Counts across every queue this process knows, so a renamed queue cannot hide work. */
    async getJobCounts() {
        const queues = [...this.queues.values()];
        const counts = await withTimeout(Promise.all(queues.map((queue) => queue.getJobCounts())), COMMAND_TIMEOUT_MS, 'getJobCounts');
        return counts.reduce((total, queueCounts) => {
            for (const [state, value] of Object.entries(queueCounts)) {
                if (typeof value === 'number')
                    total[state] = (total[state] ?? 0) + value;
            }
            return total;
        }, {});
    }
    async getWorkers() {
        const queues = [...this.queues.values()];
        const workers = await withTimeout(Promise.all(queues.map((queue) => queue.getWorkers())), COMMAND_TIMEOUT_MS, 'getWorkers');
        return workers.flat();
    }
    isReady() {
        return this.connection.status === 'ready';
    }
    async ping() {
        return withTimeout(this.connection.ping(), COMMAND_TIMEOUT_MS, 'ping');
    }
    async onModuleDestroy() {
        try {
            await Promise.allSettled(this.workers.map((worker) => worker.close()));
            await Promise.allSettled([...this.queues.values()].map((queue) => queue.close()));
            await this.connection.quit();
        }
        catch (error) {
            this.logger.warn(`Error during queue shutdown: ${error instanceof Error ? error.message : error}`);
        }
    }
};
exports.QueueService = QueueService;
exports.QueueService = QueueService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, inject_config_1.InjectConfig)()),
    __metadata("design:paramtypes", [Object])
], QueueService);
//# sourceMappingURL=queue.service.js.map