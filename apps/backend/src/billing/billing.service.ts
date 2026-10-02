import { Injectable, NotFoundException } from '@nestjs/common';
import { PlanKey } from '@prisma/client';
import { ApiError } from '../shared/errors/api-error';
import { PrismaService } from '../prisma/prisma.service';
import { SessionUser } from '../auth/session.model';
import { AuditService } from '../security/audit.service';
import { EntitlementsService } from './entitlements.service';
import { DEFAULT_PLAN, PLANS, planDefinition } from './plans';

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
@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly audit: AuditService,
  ) {}

  async capabilities() {
    const ceilings = this.entitlements.deploymentCeilings();
    return {
      plans: PLANS.map((plan) => ({
        key: plan.key,
        name: plan.name,
        summary: plan.summary,
        limits: {
          files: plan.limits.files,
          fileBytes: plan.limits.fileBytes,
          mediaAssets: plan.limits.mediaAssets,
          mediaBytes: plan.limits.mediaBytes,
        },
      })),
      defaultPlan: DEFAULT_PLAN,
      payment: {
        available: false,
        processors: [] as string[],
        detail:
          'No payment processor is configured, so ISOBASH cannot take a card, charge an account or renew anything. There is no checkout here and no plan can be bought. An account holds a plan only when an administrator grants it.',
      },
      selfService: {
        upgrade: false,
        downgrade: true,
        detail:
          'A user can return to the Free plan themselves. A higher plan is granted by an administrator, because a self-service upgrade would have to be paid for and nothing here can take payment.',
      },
      enforced: {
        files: 'Per-account file count and total bytes are checked on every upload.',
        mediaAssets: 'Per-account media asset count is checked before every generation or render.',
        mediaBytes: 'Per-account stored media bytes are checked before every generation or render.',
        note: 'A plan can lower a limit below the deployment ceiling. It can never raise one above it; that is an operator setting in the environment.',
      },
      deploymentCeilings: ceilings,
    };
  }

  /** The caller's own subscription. An absent row is reported as FREE, not as null. */
  async subscription(userId: number) {
    const row = await this.prisma.subscription.findUnique({
      where: { userId },
      select: {
        plan: true,
        grantedAt: true,
        updatedAt: true,
        note: true,
        grantedBy: { select: { id: true, email: true } },
      },
    });
    const plan = row?.plan ?? DEFAULT_PLAN;
    const entitlements = this.entitlements.forPlan(plan);
    return {
      plan,
      name: planDefinition(plan).name,
      isDefault: row === null,
      entitlements,
      grantedAt: row ? row.grantedAt.toISOString() : null,
      updatedAt: row ? row.updatedAt.toISOString() : null,
      note: row?.note ?? null,
      grantedBy: row?.grantedBy ?? null,
      detail: row
        ? `This account holds the ${planDefinition(plan).name} plan, granted by ${
            row.grantedBy ? row.grantedBy.email : 'an administrator whose account has since been removed'
          }.`
        : `This account is on the ${planDefinition(plan).name} plan, which is the default every account starts on.`,
    };
  }

  /**
   * Measured usage for this account. Every number is a live aggregate over the
   * rows the owning phases wrote, so it cannot drift from reality the way a
   * counter column would.
   */
  async usage(userId: number) {
    const periodStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const entitlements = await this.entitlements.forUser(userId);
    const { limits } = entitlements;

    const [fileCount, fileBytes, assetCount, assetBytes, conversations, messages, agents, agentRuns, research] =
      await Promise.all([
        this.prisma.storedFile.count({ where: { userId } }),
        this.prisma.storedFile.aggregate({ where: { userId }, _sum: { sizeBytes: true } }),
        this.prisma.mediaAsset.count({ where: { userId } }),
        this.prisma.mediaAsset.aggregate({ where: { userId }, _sum: { sizeBytes: true } }),
        this.prisma.conversation.count({ where: { userId } }),
        this.prisma.message.count({ where: { conversation: { userId } } }),
        this.prisma.agent.count({ where: { ownerId: userId } }),
        this.prisma.agentRun.count({ where: { agent: { ownerId: userId } } }),
        this.prisma.researchSession.count({ where: { userId } }),
      ]);

    const limited = (
      key: string,
      label: string,
      used: number,
      limit: { value: number; source: 'plan' | 'deployment' },
      unit: 'count' | 'bytes',
      detail: string,
    ): UsageMetric => ({
      key,
      label,
      used,
      limit: limit.value,
      limitSource: limit.source,
      unit,
      atLimit: used >= limit.value,
      detail,
    });

    const uncapped = (
      key: string,
      label: string,
      used: number,
      unit: 'count' | 'bytes',
      detail: string,
    ): UsageMetric => ({
      key,
      label,
      used,
      limit: null,
      limitSource: 'none',
      unit,
      atLimit: false,
      detail,
    });

    return {
      plan: entitlements.plan,
      measuredAt: new Date().toISOString(),
      window: { days: 30, startedAt: periodStart.toISOString() },
      metrics: [
        limited('files', 'Stored files', fileCount, limits.files, 'count', 'Enforced on every upload.'),
        limited(
          'fileBytes',
          'Stored file bytes',
          fileBytes._sum.sizeBytes ?? 0,
          limits.fileBytes,
          'bytes',
          'Enforced on every upload, counting the bytes of the file being added.',
        ),
        limited('mediaAssets', 'Media assets', assetCount, limits.mediaAssets, 'count', 'Checked before every generation or render.'),
        limited(
          'mediaBytes',
          'Stored media bytes',
          assetBytes._sum.sizeBytes ?? 0,
          limits.mediaBytes,
          'bytes',
          'Checked before every generation or render.',
        ),
        uncapped('conversations', 'Conversations', conversations, 'count', 'No plan limit; requests are rate limited instead.'),
        uncapped('messages', 'Messages', messages, 'count', 'Counted across every conversation this account owns.'),
        uncapped('agents', 'Agents', agents, 'count', 'No plan limit.'),
        uncapped('agentRuns', 'Agent runs', agentRuns, 'count', 'Rate limited per account, not capped by plan.'),
        uncapped('researchSessions', 'Research sessions', research, 'count', 'Rate limited per account, not capped by plan.'),
      ],
      detail:
        'Every figure here is a live count over the records this account actually owns, read at the moment of the request. Nothing is estimated, sampled or carried forward, so deleting a file lowers the number on the next read.',
    };
  }

  /**
   * Self-service downgrade to Free. Upgrading is deliberately not offered: with
   * no payment processor there is nothing to charge, and a self-service upgrade
   * button would be a claim ISOBASH cannot keep.
   */
  async downgrade(actor: SessionUser) {
    const existing = await this.prisma.subscription.findUnique({
      where: { userId: actor.id },
      select: { id: true, plan: true },
    });
    if (!existing || existing.plan === DEFAULT_PLAN) {
      throw new ApiError(
        'This account is already on the Free plan.',
        400,
        'ALREADY_ON_PLAN',
      );
    }
    await this.prisma.subscription.delete({ where: { userId: actor.id } });
    await this.audit.log({
      category: 'ADMIN',
      action: 'billing.plan_changed',
      actorId: actor.id,
      actorEmail: actor.email,
      metadata: { to: DEFAULT_PLAN, from: existing.plan, by: 'self' },
    });
    return this.subscription(actor.id);
  }

  /** Admin-granted plan change. The only path to a plan above Free. */
  async grantPlan(actor: SessionUser, userId: number, plan: PlanKey, note?: string) {
    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });
    if (!target) throw new NotFoundException('User not found.');

    const before = await this.prisma.subscription.findUnique({
      where: { userId },
      select: { plan: true },
    });

    if (plan === DEFAULT_PLAN) {
      // Dropping to Free removes the row rather than storing FREE, so "has an
      // entitlement" and "is on the default" can never both be true.
      await this.prisma.subscription.deleteMany({ where: { userId } });
    } else {
      await this.prisma.subscription.upsert({
        where: { userId },
        create: { userId, plan, grantedById: actor.id, note: note ?? null },
        update: { plan, grantedById: actor.id, note: note ?? null },
      });
    }

    await this.audit.log({
      category: 'ADMIN',
      action: 'billing.plan_changed',
      actorId: actor.id,
      actorEmail: actor.email,
      metadata: { targetUserId: userId, targetEmail: target.email, from: before?.plan ?? DEFAULT_PLAN, to: plan, note: note ?? null },
    });

    const entitlements = await this.entitlements.forUser(userId);
    return { userId, plan: entitlements.plan, entitlements };
  }
}