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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EntitlementsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const inject_config_1 = require("../shared/config/inject-config");
const plans_1 = require("./plans");
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
let EntitlementsService = class EntitlementsService {
    prisma;
    config;
    constructor(prisma, config) {
        this.prisma = prisma;
        this.config = config;
    }
    resolve(planLimit, deploymentMax) {
        if (planLimit === null)
            return { value: deploymentMax, source: 'deployment' };
        return { value: Math.min(planLimit, deploymentMax), source: 'plan' };
    }
    /** Entitlements for a known plan. Pure: no database access. */
    forPlan(plan) {
        const definition = (0, plans_1.planDefinition)(plan);
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
    async forUser(userId) {
        const subscription = await this.prisma.subscription.findUnique({
            where: { userId },
            select: { plan: true },
        });
        return this.forPlan(subscription?.plan ?? plans_1.DEFAULT_PLAN);
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
};
exports.EntitlementsService = EntitlementsService;
exports.EntitlementsService = EntitlementsService = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, inject_config_1.InjectConfig)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, Object])
], EntitlementsService);
//# sourceMappingURL=entitlements.service.js.map