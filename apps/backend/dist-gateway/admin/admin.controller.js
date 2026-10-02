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
exports.AdminController = void 0;
const common_1 = require("@nestjs/common");
const auth_guard_1 = require("../auth/auth.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const roles_decorator_1 = require("../auth/roles.decorator");
const roles_guard_1 = require("../auth/roles.guard");
const rate_limit_guard_1 = require("../security/rate-limit.guard");
const audit_service_1 = require("../security/audit.service");
const admin_users_service_1 = require("./admin-users.service");
const admin_user_dto_1 = require("./dto/admin-user.dto");
const system_health_service_1 = require("./system-health.service");
const admin_settings_service_1 = require("./admin-settings.service");
const provider_credit_service_1 = require("../ai/provider-credit.service");
const billing_service_1 = require("../billing/billing.service");
const billing_dto_1 = require("../billing/dto/billing.dto");
const admin_shell_service_1 = require("./admin-shell.service");
// Authorization is decided here and by RolesGuard, never by the client. The
// frontend only renders what this surface returns.
let AdminController = class AdminController {
    systemHealth;
    users;
    audit;
    credits;
    settings;
    billing;
    shell;
    constructor(systemHealth, users, audit, credits, settings, billing, shell) {
        this.systemHealth = systemHealth;
        this.users = users;
        this.audit = audit;
        this.credits = credits;
        this.settings = settings;
        this.billing = billing;
        this.shell = shell;
    }
    getSystemHealth() {
        return this.systemHealth.checkAll();
    }
    /**
     * Phase 17 admin center: live counts for the overview. Every figure is an
     * aggregate over the same tables the product surfaces read, so the console and
     * the workspace cannot disagree.
     */
    overview() {
        return this.settings.overview();
    }
    /**
     * Phase 17: what this deployment is configured to do, with every secret
     * reduced to a boolean. Read-only on purpose — see `AdminSettingsService`.
     */
    settingsView() {
        return this.settings.settings();
    }
    /**
     * The shared video credit pool, month to date.
     *
     * Admin-only, and deliberately not filtered by user: this is one budget for the
     * whole deployment, so a per-user view of it would be actively misleading. The
     * response separates the provider's own balance from ISOBASH's ledger, because
     * they disagree whenever anything was rendered outside ISOBASH, and only the
     * provider's number is the authority on what can still be spent.
     */
    getVideoCredits() {
        return this.credits.summary('magic-hour');
    }
    async executeShell(body) {
        if (typeof body?.command !== 'string') {
            return {
                ok: false,
                blocked: true,
                command: '',
                stdout: '',
                stderr: 'A command string is required.',
                exitCode: 1,
            };
        }
        return this.shell.execute(body.command);
    }
    listUsers(query) {
        return this.users.list(query);
    }
    getUser(id) {
        return this.users.get(id);
    }
    updateRole(actor, id, input) {
        return this.users.updateRole(actor, id, input);
    }
    /**
     * Phase 16/17: grant or withdraw a plan. This is the only path to a plan above
     * Free, because there is no payment processor: an entitlement that appeared on
     * its own would be a claim ISOBASH cannot keep. Audited in the service.
     */
    updatePlan(actor, id, input) {
        return this.billing.grantPlan(actor, id, input.plan, input.note);
    }
    revokeSessions(actor, id, req) {
        // Recorded here as well as in the service so the operator's IP is captured.
        void this.audit.log({
            category: 'ADMIN',
            action: 'admin.user.sessions_revoke_requested',
            actorId: actor.id,
            actorEmail: actor.email,
            ...this.audit.fromRequest(req),
            metadata: { targetUserId: id },
        });
        return this.users.revokeSessions(actor, id);
    }
};
exports.AdminController = AdminController;
__decorate([
    (0, common_1.Get)('system-health'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "getSystemHealth", null);
__decorate([
    (0, common_1.Get)('overview'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "overview", null);
__decorate([
    (0, common_1.Get)('settings'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "settingsView", null);
__decorate([
    (0, common_1.Get)('video-credits'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "getVideoCredits", null);
__decorate([
    (0, common_1.HttpCode)(200),
    (0, common_1.UseGuards)(rate_limit_guard_1.RateLimitGuard),
    (0, rate_limit_guard_1.RateLimit)({ limit: 10, windowMs: 60_000 }),
    (0, common_1.Post)('shell/exec'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "executeShell", null);
__decorate([
    (0, common_1.Get)('users'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [admin_user_dto_1.ListUsersQueryDto]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "listUsers", null);
__decorate([
    (0, common_1.Get)('users/:id'),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "getUser", null);
__decorate([
    (0, common_1.Patch)('users/:id/role'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number, admin_user_dto_1.UpdateUserRoleDto]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "updateRole", null);
__decorate([
    (0, common_1.Patch)('users/:id/plan'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number, billing_dto_1.ChangePlanDto]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "updatePlan", null);
__decorate([
    (0, common_1.HttpCode)(200),
    (0, common_1.UseGuards)(rate_limit_guard_1.RateLimitGuard),
    (0, rate_limit_guard_1.RateLimit)({ limit: 30, windowMs: 15 * 60 * 1000 }),
    (0, common_1.Post)('users/:id/revoke-sessions'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number, Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "revokeSessions", null);
exports.AdminController = AdminController = __decorate([
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('ADMIN'),
    (0, common_1.Controller)('admin'),
    __metadata("design:paramtypes", [system_health_service_1.SystemHealthService,
        admin_users_service_1.AdminUsersService,
        audit_service_1.AuditService,
        provider_credit_service_1.ProviderCreditService,
        admin_settings_service_1.AdminSettingsService,
        billing_service_1.BillingService,
        admin_shell_service_1.AdminShellService])
], AdminController);
//# sourceMappingURL=admin.controller.js.map