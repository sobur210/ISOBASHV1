import { SessionUser } from '../auth/session.model';
import { BillingService } from './billing.service';
export declare class BillingController {
    private readonly billing;
    constructor(billing: BillingService);
    /**
     * Public to any signed-in account, and safe to call without one: it describes
     * the deployment, not the caller. There is deliberately no `paymentMethods`
     * array here, because there is no processor to hold one.
     */
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
    subscription(user: SessionUser): Promise<{
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
    usage(user: SessionUser): Promise<{
        plan: import(".prisma/client").$Enums.PlanKey;
        measuredAt: string;
        window: {
            days: number;
            startedAt: string;
        };
        metrics: import("./billing.service").UsageMetric[];
        detail: string;
    }>;
    /**
     * Returning to the Free plan is the one billing action a user can take. It is
     * `DELETE` on purpose: the account stops holding an entitlement, which is what
     * removing the row means. Upgrading is not exposed here at all — see
     * `capabilities().selfService`.
     */
    downgrade(user: SessionUser): Promise<{
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
}
