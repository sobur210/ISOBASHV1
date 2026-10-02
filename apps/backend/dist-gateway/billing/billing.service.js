"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BillingService = void 0;
const common_1 = require("@nestjs/common");
const api_error_1 = require("../shared/errors/api-error");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../security/audit.service");
const entitlements_service_1 = require("./entitlements.service");
const plans_1 = require("./plans");
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
let BillingService = class BillingService {
    prisma;
    entitlements;
    audit;
    constructor(prisma, entitlements, audit) {
        this.prisma = prisma;
        this.entitlements = entitlements;
        this.audit = audit;
    }
    async capabilities() {
        const ceilings = this.entitlements.deploymentCeilings();
        return {
            plans: plans_1.PLANS.map((plan) => ({
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
            defaultPlan: plans_1.DEFAULT_PLAN,
            payment: {
                available: false,
                processors: [],
                detail: 'No payment processor is configured, so ISOBASH cannot take a card, charge an account or renew anything. There is no checkout here and no plan can be bought. An account holds a plan only when an administrator grants it.',
            },
            selfService: {
                upgrade: false,
                downgrade: true,
                detail: 'A user can return to the Free plan themselves. A higher plan is granted by an administrator, because a self-service upgrade would have to be paid for and nothing here can take payment.',
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
    async subscription(userId) {
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
        const plan = row?.plan ?? plans_1.DEFAULT_PLAN;
        const entitlements = this.entitlements.forPlan(plan);
        return {
            plan,
            name: (0, plans_1.planDefinition)(plan).name,
            isDefault: row === null,
            entitlements,
            grantedAt: row ? row.grantedAt.toISOString() : null,
            updatedAt: row ? row.updatedAt.toISOString() : null,
            note: row?.note ?? null,
            grantedBy: row?.grantedBy ?? null,
            detail: row
                ? `This account holds the ${(0, plans_1.planDefinition)(plan).name} plan, granted by ${row.grantedBy ? row.grantedBy.email : 'an administrator whose account has since been removed'}.`
                : `This account is on the ${(0, plans_1.planDefinition)(plan).name} plan, which is the default every account starts on.`,
        };
    }
    /**
     * Measured usage for this account. Every number is a live aggregate over the
     * rows the owning phases wrote, so it cannot drift from reality the way a
     * counter column would.
     */
    async usage(userId) {
        const periodStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const entitlements = await this.entitlements.forUser(userId);
        const { limits } = entitlements;
        const [fileCount, fileBytes, assetCount, assetBytes, conversations, messages, agents, agentRuns, research] = await Promise.all([
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
        const limited = (key, label, used, limit, unit, detail) => ({
            key,
            label,
            used,
            limit: limit.value,
            limitSource: limit.source,
            unit,
            atLimit: used >= limit.value,
            detail,
        });
        const uncapped = (key, label, used, unit, detail) => ({
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
                limited('fileBytes', 'Stored file bytes', fileBytes._sum.sizeBytes ?? 0, limits.fileBytes, 'bytes', 'Enforced on every upload, counting the bytes of the file being added.'),
                limited('mediaAssets', 'Media assets', assetCount, limits.mediaAssets, 'count', 'Checked before every generation or render.'),
                limited('mediaBytes', 'Stored media bytes', assetBytes._sum.sizeBytes ?? 0, limits.mediaBytes, 'bytes', 'Checked before every generation or render.'),
                uncapped('conversations', 'Conversations', conversations, 'count', 'No plan limit; requests are rate limited instead.'),
                uncapped('messages', 'Messages', messages, 'count', 'Counted across every conversation this account owns.'),
                uncapped('agents', 'Agents', agents, 'count', 'No plan limit.'),
                uncapped('agentRuns', 'Agent runs', agentRuns, 'count', 'Rate limited per account, not capped by plan.'),
                uncapped('researchSessions', 'Research sessions', research, 'count', 'Rate limited per account, not capped by plan.'),
            ],
            detail: 'Every figure here is a live count over the records this account actually owns, read at the moment of the request. Nothing is estimated, sampled or carried forward, so deleting a file lowers the number on the next read.',
        };
    }
    /**
     * Self-service downgrade to Free. Upgrading is deliberately not offered: with
     * no payment processor there is nothing to charge, and a self-service upgrade
     * button would be a claim ISOBASH cannot keep.
     */
    async downgrade(actor) {
        const existing = await this.prisma.subscription.findUnique({
            where: { userId: actor.id },
            select: { id: true, plan: true },
        });
        if (!existing || existing.plan === plans_1.DEFAULT_PLAN) {
            throw new api_error_1.ApiError('This account is already on the Free plan.', 400, 'ALREADY_ON_PLAN');
        }
        await this.prisma.subscription.delete({ where: { userId: actor.id } });
        await this.audit.log({
            category: 'ADMIN',
            action: 'billing.plan_changed',
            actorId: actor.id,
            actorEmail: actor.email,
            metadata: { to: plans_1.DEFAULT_PLAN, from: existing.plan, by: 'self' },
        });
        return this.subscription(actor.id);
    }
    /** Admin-granted plan change. The only path to a plan above Free. */
    async grantPlan(actor, userId, plan, note) {
        const target = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, email: true },
        });
        if (!target)
            throw new common_1.NotFoundException('User not found.');
        const before = await this.prisma.subscription.findUnique({
            where: { userId },
            select: { plan: true },
        });
        if (plan === plans_1.DEFAULT_PLAN) {
            // Dropping to Free removes the row rather than storing FREE, so "has an
            // entitlement" and "is on the default" can never both be true.
            await this.prisma.subscription.deleteMany({ where: { userId } });
        }
        else {
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
            metadata: { targetUserId: userId, targetEmail: target.email, from: before?.plan ?? plans_1.DEFAULT_PLAN, to: plan, note: note ?? null },
        });
        const entitlements = await this.entitlements.forUser(userId);
        return { userId, plan: entitlements.plan, entitlements };
    }
};
exports.BillingService = BillingService;
exports.BillingService = BillingService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        entitlements_service_1.EntitlementsService,
        audit_service_1.AuditService])
], BillingService);
//# sourceMappingURL=billing.service.js.map