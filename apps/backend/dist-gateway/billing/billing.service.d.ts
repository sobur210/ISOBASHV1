import { PlanKey } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SessionUser } from '../auth/session.model';
import { AuditService } from '../security/audit.service';
import { EntitlementsService } from './entitlements.service';
export type UsageMetric = {
    key: string;
    label: string;
    used: number;
    limit: number | null;
    limitSource: 'plan' | 'deployment' | 'none';
    unit: 'count' | 'bytes';
    /** `true` when a measured value is at or over its limit right now. */
    atLimit: boolean;
    detail: string;
};
/**
 * Phase 16 billing.
 *
 * What this service deliberately does **not** do is the important part: it takes
 * no payment. There is no processor configured in this deployment, so there is no
 * card form, no checkout, no invoice, no "renewal date" and no self-service
 * upgrade. `capabilities()` says so in the response instead of the UI implying
 * otherwise.
 *
 * What it does do is real:
 *  - usage is **measured** from the rows the other phases actually wrote, never
 *    estimated or cached, so deleting a file lowers the number immediately;
 *  - a plan is an **entitlement** the files and media quota checks already read
 *    (see `EntitlementsService`), so it changes behaviour rather than display;
 *  - granting a plan is an **admin action** and is audited, because a plan the
 *    system quietly upgraded somebody to would be a lie.
 */
export declare class BillingService {
    private readonly prisma;
    private readonly entitlements;
    private readonly audit;
    constructor(prisma: PrismaService, entitlements: EntitlementsService, audit: AuditService);
    capabilities(): Promise<{
        plans: {
            key: import(".prisma/client").$Enums.PlanKey;
            name: string;
            summary: string;
            limits: {
                files: number | null;
                fileBytes: number | null;
                mediaAssets: number | null;
                mediaBytes: number | null;
            };
        }[];
        defaultPlan: import(".prisma/client").$Enums.PlanKey;
        payment: {
            available: boolean;
            processors: string[];
            detail: string;
        };
        selfService: {
            upgrade: boolean;
            downgrade: boolean;
            detail: string;
        };
        enforced: {
            files: string;
            mediaAssets: string;
            mediaBytes: string;
            note: string;
        };
        deploymentCeilings: {
            files: number;
            fileBytes: number;
            mediaAssets: number;
            mediaBytes: number;
        };
    }>;
    /** The caller's own subscription. An absent row is reported as FREE, not as null. */
    subscription(userId: number): Promise<{
        plan: import(".prisma/client").$Enums.PlanKey;
        name: string;
        isDefault: boolean;
        entitlements: import("./entitlements.service").Entitlements;
        grantedAt: string | null;
        updatedAt: string | null;
        note: string | null;
        grantedBy: {
            id: number;
            email: string;
        } | null;
        detail: string;
    }>;
    /**
     * Measured usage for this account. Every number is a live aggregate over the
     * rows the owning phases wrote, so it cannot drift from reality the way a
     * counter column would.
     */
    usage(userId: number): Promise<{
        plan: import(".prisma/client").$Enums.PlanKey;
        measuredAt: string;
        window: {
            days: number;
            startedAt: string;
        };
        metrics: UsageMetric[];
        detail: string;
    }>;
    /**
     * Self-service downgrade to Free. Upgrading is deliberately not offered: with
     * no payment processor there is nothing to charge, and a self-service upgrade
     * button would be a claim ISOBASH cannot keep.
     */
    downgrade(actor: SessionUser): Promise<{
        plan: import(".prisma/client").$Enums.PlanKey;
        name: string;
        isDefault: boolean;
        entitlements: import("./entitlements.service").Entitlements;
        grantedAt: string | null;
        updatedAt: string | null;
        note: string | null;
        grantedBy: {
            id: number;
            email: string;
        } | null;
        detail: string;
    }>;
    /** Admin-granted plan change. The only path to a plan above Free. */
    grantPlan(actor: SessionUser, userId: number, plan: PlanKey, note?: string): Promise<{
        userId: number;
        plan: import(".prisma/client").$Enums.PlanKey;
        entitlements: import("./entitlements.service").Entitlements;
    }>;
}
