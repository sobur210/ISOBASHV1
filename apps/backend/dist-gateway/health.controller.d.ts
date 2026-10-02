import { HealthService } from './health.service';
export declare class HealthController {
    private readonly health;
    constructor(health: HealthService);
    getLiveness(): Promise<{
        status: string;
        service: string;
        timestamp: string;
        components: import("./health.service").ComponentStatus[];
    }>;
}
