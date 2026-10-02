import { AppConfig } from '../shared/config/configuration';
import { QueueService } from '../queues/queue.service';
import { AiProviderRegistry } from '../ai/provider.registry';
import { PrismaService } from '../prisma/prisma.service';
/**
 * Phase 17 admin center: what this deployment is actually configured to do.
 *
 * Every value here is read from the live `AppConfig` the API booted with, and
 * every secret is reduced to a boolean. There is no endpoint that *writes*
 * configuration and no control that pretends to toggle a provider: every such
 * setting is environment-driven, so a toggle that changed a row would leave the
 * running process unchanged and be a lie. The response says so instead.
 */
export declare class AdminSettingsService {
    private readonly config;
    private readonly queues;
    private readonly providers;
    private readonly prisma;
    constructor(config: AppConfig, queues: QueueService, providers: AiProviderRegistry, prisma: PrismaService);
    /**
     * A secret is reported as present or absent, never echoed. Even a partially
     * masked key is a credential fragment in an admin response body, and there is
     * no consumer of one.
     */
    private presence;
    settings(): Promise<{
        runtime: {
            node: string;
            platform: string;
            uptimeSeconds: number;
            apiUrl: string;
            webUrl: string;
            corsOrigins: string[];
        };
        storage: {
            dataRoot: string;
            uploadRoot: string;
            mediaRoot: string;
            tempRoot: string;
            logsRoot: string;
            cacheRoot: string;
            knowledgeRoot: string;
            modelRoot: string;
            detail: string;
        };
        providers: ({
            provider: string;
            enabled: boolean;
            baseUrl: string;
            model: string;
            embeddingModel: string;
            credentialPresent: boolean;
            credentialKind: string;
        } | {
            provider: string;
            enabled: boolean;
            baseUrl: null;
            model: string;
            embeddingModel: string;
            credentialPresent: boolean;
            credentialKind: string;
        })[];
        registeredProviders: string[];
        limits: {
            files: {
                maxBytes: number;
                maxFilesPerUser: number;
                maxTotalBytesPerUser: number;
                chunkSize: number;
                maxChunksPerFile: number;
                minVectorSimilarity: number;
            };
            media: {
                maxPromptCharacters: number;
                maxImagesPerRequest: number;
                maxAssetsPerUser: number;
                maxTotalBytesPerUser: number;
                maxImageBytes: number;
                aspectRatios: string[];
                generationsPerHour: number;
            };
            research: {
                maxSources: number;
                maxCharactersPerSource: number;
                fetchTimeoutMs: number;
                searchConfigured: boolean;
            };
        };
        queues: {
            counts: Record<string, number> | null;
            workers: number | null;
            ready: boolean;
            detail: string;
        };
        writable: boolean;
        detail: string;
    }>;
    /** Counts across the tables the admin overview shows, each a real aggregate. */
    overview(): Promise<{
        generatedAt: string;
        accounts: {
            total: number;
            admins: number;
            onFree: number;
            onPro: number;
            activeSessions: number;
            registeredLast24h: number;
        };
        content: {
            projects: number;
            conversations: number;
            messages: number;
            agents: number;
            agentRuns: number;
            researchSessions: number;
            files: number;
            mediaAssets: number;
        };
        audit: {
            last24h: number;
            last7d: number;
        };
        detail: string;
    }>;
}
