import { PrismaService } from './prisma/prisma.service';
import { QueueService } from './queues/queue.service';
export type ComponentStatus = {
    name: string;
    status: 'ok' | 'error';
    detail?: string;
};
export declare class HealthService {
    private readonly prisma;
    private readonly queue;
    private readonly logger;
    constructor(prisma: PrismaService, queue: QueueService);
    check(): Promise<{
        status: string;
        service: string;
        timestamp: string;
        components: ComponentStatus[];
    }>;
    private checkDatabase;
    private checkRedis;
}
