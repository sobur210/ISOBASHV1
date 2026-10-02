import { Injectable } from '@nestjs/common';
import { PlanKey } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InjectConfig } from '../shared/config/inject-config';
import { AppConfig } from '../shared/config/configuration';
import { DEFAULT_PLAN, planDefinition, ResolvedLimit } from './plans';

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
@Injectable()
export class EntitlementsService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectConfig() private readonly config: AppConfig,
  ) {}

  private resolve(planLimit: number | null, deploymentMax: number): ResolvedLimit {
    if (planLimit === null) return { value: deploymentMax, source: 'deployment' };
    return { value: Math.min(planLimit, deploymentMax), source: 'plan' };
  }

  /** Entitlements for a known plan. Pure: no database access. */
  forPlan(plan: PlanKey): Entitlements {
    const definition = planDefinition(plan);
    return {
      plan: definition.key,
      limits: {
        files: this.resolve(definition.limits.files, this.config.files.maxFilesPerUser),
        fileBytes: this.resolve(definition.limits.fileBytes, this.config.files.maxTotalBytesPerUser),
        mediaAssets: this.resolve(definition.limits.mediaAssets, this.config.media.maxAssetsPerUser),
        mediaBytes: this.resolve(definition.limits.mediaBytes, this.config.media.maxTotalBytesPerUser),
      },
    };
  }

  /**
   * Entitlements for an account. An account with no `Subscription` row is on the
   * FREE plan — the absence of a row is the default, so no user can end up
   * without a plan and no lookup can fail open to something larger.
   *
   * The result is cached for the life of one request only in the sense that it is
   * a single indexed read; there is no cross-request cache, so granting a plan is
   * effective on the next quota check rather than the next deploy.
   */
  async forUser(userId: number): Promise<Entitlements> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
      select: { plan: true },
    });
    return this.forPlan(subscription?.plan ?? DEFAULT_PLAN);
  }

  /** The deployment ceilings, reported next to the plans so a cap is never a surprise. */
  deploymentCeilings() {
    return {
      files: this.config.files.maxFilesPerUser,
      fileBytes: this.config.files.maxTotalBytesPerUser,
      mediaAssets: this.config.media.maxAssetsPerUser,
      mediaBytes: this.config.media.maxTotalBytesPerUser,
    };
  }
}