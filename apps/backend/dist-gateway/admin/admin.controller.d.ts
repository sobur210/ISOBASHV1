import { Request } from 'express';
import { SessionUser } from '../auth/session.model';
import { AuditService } from '../security/audit.service';
import { AdminUsersService } from './admin-users.service';
import { ListUsersQueryDto, UpdateUserRoleDto } from './dto/admin-user.dto';
import { SystemHealthService } from './system-health.service';
import { AdminSettingsService } from './admin-settings.service';
import { ProviderCreditService } from '../ai/provider-credit.service';
import { BillingService } from '../billing/billing.service';
import { ChangePlanDto } from '../billing/dto/billing.dto';
import { AdminShellService } from './admin-shell.service';
export declare class AdminController {
    private readonly systemHealth;
    private readonly users;
    private readonly audit;
    private readonly credits;
    private readonly settings;
    private readonly billing;
    private readonly shell;
    constructor(systemHealth: SystemHealthService, users: AdminUsersService, audit: AuditService, credits: ProviderCreditService, settings: AdminSettingsService, billing: BillingService, shell: AdminShellService);
    getSystemHealth(): Promise<import("./system-health.service").SystemHealthResult>;
    /**
     * Phase 17 admin center: live counts for the overview. Every figure is an
     * aggregate over the same tables the product surfaces read, so the console and
     * the workspace cannot disagree.
     */
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
    /**
     * Phase 17: what this deployment is configured to do, with every secret
     * reduced to a boolean. Read-only on purpose — see `AdminSettingsService`.
     */
    settingsView(): Promise<{
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
    /**
     * The shared video credit pool, month to date.
     *
     * Admin-only, and deliberately not filtered by user: this is one budget for the
     * whole deployment, so a per-user view of it would be actively misleading. The
     * response separates the provider's own balance from ISOBASH's ledger, because
     * they disagree whenever anything was rendered outside ISOBASH, and only the
     * provider's number is the authority on what can still be spent.
     */
    getVideoCredits(): Promise<import("../ai/provider-credit.service").CreditMonthSummary>;
    executeShell(body: {
        command?: string;
    }): Promise<import("./admin-shell.service").ShellCommandExecutionResult>;
    listUsers(query: ListUsersQueryDto): Promise<{
        users: import("./admin-users.service").AdminUserSummary[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    }>;
    getUser(id: number): Promise<import("./admin-users.service").AdminUserSummary>;
    updateRole(actor: SessionUser, id: number, input: UpdateUserRoleDto): Promise<{
        revokedSessions: number;
        id: number;
        email: string;
        name: string | null;
        role: "ADMIN" | "USER";
        mfaEnabled: boolean;
        createdAt: string;
        lastLoginAt: string | null;
        activeSessions: number;
    }>;
    /**
     * Phase 16/17: grant or withdraw a plan. This is the only path to a plan above
     * Free, because there is no payment processor: an entitlement that appeared on
     * its own would be a claim ISOBASH cannot keep. Audited in the service.
     */
    updatePlan(actor: SessionUser, id: number, input: ChangePlanDto): Promise<{
        userId: number;
        plan: import(".prisma/client").$Enums.PlanKey;
        entitlements: import("../billing/entitlements.service").Entitlements;
    }>;
    revokeSessions(actor: SessionUser, id: number, req: Request): Promise<{
        revokedSessions: number;
    }>;
}
