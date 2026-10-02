import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queues/queue.service';
import { AppConfig } from '../shared/config/configuration';
export type SystemComponentStatus = {
    name: string;
    status: 'ok' | 'error';
    detail?: string;
    latencyMs?: number;
};
export type SystemHealthResult = {
    status: 'ok' | 'degraded';
    service: string;
    timestamp: string;
    components: SystemComponentStatus[];
};
export declare class SystemHealthService {
    private readonly config;
    private readonly prisma;
    private readonly queue;
    private readonly logger;
    constructor(config: AppConfig, prisma: PrismaService, queue: QueueService);
    checkAll(): Promise<SystemHealthResult>;
    private checkFrontend;
    private checkDatabase;
    private checkRedis;
    private checkJobQueue;
    private checkOllama;
}
