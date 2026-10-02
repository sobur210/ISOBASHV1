import { PlanKey } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfig } from '../shared/config/configuration';
import { ResolvedLimit } from './plans';
export type Entitlements = {
    plan: PlanKey;
    limits: {
        files: ResolvedLimit;
        fileBytes: ResolvedLimit;
        mediaAssets: ResolvedLimit;
        mediaBytes: ResolvedLimit;
    };
};
/**
 * Phase 16: the one place that answers "what is this account allowed to use".
 *
 * Two rules make this trustworthy rather than decorative:
 *
 *  1. **A plan can only lower a limit.** Every catalogue limit is clamped
 *     against the deployment's own configured maximum (`FILES_MAX_FILES_PER_USER`
 *     and friends). Raising a ceiling is an operator decision made in the
 *     environment, never something a plan row can do.
 *  2. **The source is always reported.** Each limit says whether the number came
 *     from the plan or from the deployment, so the API never presents the
 *     operator's configured maximum as if the plan invented it.
 *
 * Files and media services call `forUser()` for their quota checks, so an
 * entitlement is enforced rather than merely displayed.
 */
export declare class EntitlementsService {
    private readonly prisma;
    private readonly config;
    constructor(prisma: PrismaService, config: AppConfig);
    private resolve;
    /** Entitlements for a known plan. Pure: no database access. */
    forPlan(plan: PlanKey): Entitlements;
    /**
     * Entitlements for an account. An account with no `Subscription` row is on the
     * FREE plan — the absence of a row is the default, so no user can end up
     * without a plan and no lookup can fail open to something larger.
     *
     * The result is cached for the life of one request only in the sense that it is
     * a single indexed read; there is no cross-request cache, so granting a plan is
     * effective on the next quota check rather than the next deploy.
     */
    forUser(userId: number): Promise<Entitlements>;
    /** The deployment ceilings, reported next to the plans so a cap is never a surprise. */
    deploymentCeilings(): {
        files: number;
        fileBytes: number;
        mediaAssets: number;
        mediaBytes: number;
    };
}
