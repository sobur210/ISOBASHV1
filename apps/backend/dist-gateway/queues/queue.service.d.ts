import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { JobsOptions, Processor, Queue, Worker } from 'bullmq';
import { AppConfig } from '../shared/config/configuration';
/** The general-purpose queue. Work any process can do, and nothing that only one can. */
export declare const DEFAULT_QUEUE_NAME = "isobash-queue";
export declare class RedisUnavailableError extends Error {
    constructor(operation: string, cause: unknown);
}
export declare class QueueService implements OnModuleInit, OnModuleDestroy {
    private readonly logger;
    private readonly connection;
    /**
     * Every queue this process has touched, keyed by name.
     *
     * Several queues exist because they are not interchangeable: work that only one
     * kind of process can do must not be visible to the others (see
     * `video-render-job.ts`). They are tracked together so the health panel still
     * reports one honest picture of what is waiting, instead of a queue that always
     * looks idle because the real work went somewhere else.
     */
    private readonly queues;
    private readonly workers;
    private readonly config;
    constructor(config: AppConfig);
    /**
     * Bounded startup probe. `maxRetriesPerRequest: null` means a `ping()` against a
     * dead Redis never settles; awaiting it inside `onModuleInit` would block Nest's
     * init hook forever and the HTTP server would never bind its port (the API then
     * looks "unreachable" with no error anywhere). We wait a bounded amount of time,
     * log the real failure, and let the app boot in a degraded state so `/health`
     * reports the truth instead of the process dying silently.
     */
    onModuleInit(): Promise<void>;
    getQueue(): Queue;
    /**
     * The queue for a name, created on first use.
     *
     * Named queues are how a job is offered only to the processes that can do it, so
     * the name is part of the contract rather than an implementation detail: a producer
     * and its workers have to agree on it, which is why callers import the name from
     * the module that owns the job.
     */
    queueNamed(name: string): Queue;
    private newQueue;
    addJob(name: string, data: unknown, options?: JobsOptions, queueName?: string): Promise<import("bullmq").Job<any, any, string>>;
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
    createWorker(name: string, processor: Processor, options?: {
        concurrency?: number;
    }): Worker | null;
    /** Counts across every queue this process knows, so a renamed queue cannot hide work. */
    getJobCounts(): Promise<Record<string, number>>;
    getWorkers(): Promise<{
        [index: string]: string;
    }[]>;
    isReady(): boolean;
    ping(): Promise<string>;
    onModuleDestroy(): Promise<void>;
}
