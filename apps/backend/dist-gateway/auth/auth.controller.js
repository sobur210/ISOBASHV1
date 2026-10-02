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
exports.AuthController = void 0;
const common_1 = require("@nestjs/common");
const audit_service_1 = require("../security/audit.service");
const rate_limit_guard_1 = require("../security/rate-limit.guard");
const session_model_1 = require("./session.model");
const auth_service_1 = require("./auth.service");
const auth_guard_1 = require("./auth.guard");
const current_user_decorator_1 = require("./current-user.decorator");
const login_dto_1 = require("./dto/login.dto");
const register_dto_1 = require("./dto/register.dto");
const mfa_code_dto_1 = require("./dto/mfa-code.dto");
const mfa_setup_dto_1 = require("./dto/mfa-setup.dto");
const mfa_verify_dto_1 = require("./dto/mfa-verify.dto");
let AuthController = class AuthController {
    auth;
    audit;
    constructor(auth, audit) {
        this.auth = auth;
        this.audit = audit;
    }
    context(req) {
        return this.audit.fromRequest(req);
    }
    async register(res, req, dto) {
        const { user, session } = await this.auth.register(dto, this.context(req).ip, this.context(req).userAgent);
        this.auth.setAuthCookie(res, session.id);
        return { user };
    }
    async login(res, req, dto) {
        if (req.cookies?.[session_model_1.AUTH_COOKIE_NAME]) {
            await this.auth.revoke(req.cookies[session_model_1.AUTH_COOKIE_NAME]);
            this.auth.clearAuthCookie(res);
        }
        const result = await this.auth.login(dto, this.context(req).ip, this.context(req).userAgent);
        if (result.kind === 'mfa') {
            return { mfaRequired: true, mfaToken: result.mfaToken };
        }
        this.auth.setAuthCookie(res, result.session.id);
        return { user: result.user };
    }
    async verifyMfa(res, req, dto) {
        const { user, session } = await this.auth.completeMfaLogin(dto.token, dto.code, this.context(req).ip, this.context(req).userAgent);
        this.auth.setAuthCookie(res, session.id);
        return { user };
    }
    async logout(req, res) {
        const sessionId = req.cookies?.[session_model_1.AUTH_COOKIE_NAME];
        const session = sessionId ? await this.auth.resolveUser(sessionId) : null;
        await this.auth.revoke(sessionId);
        this.auth.clearAuthCookie(res);
        await this.audit.log({
            category: 'AUTH',
            action: 'logout',
            actorId: session?.id,
            actorEmail: session?.email,
            ...this.context(req),
        });
        return { ok: true };
    }
    async me(req) {
        const sessionId = req.cookies?.[session_model_1.AUTH_COOKIE_NAME];
        return this.auth.sessionUser(sessionId);
    }
    async setupMfa(req, user, dto) {
        return this.auth.setupMfa(user, dto.password, this.context(req).ip, this.context(req).userAgent);
    }
    async enableMfa(req, user, dto) {
        const sessionId = req.cookies?.[session_model_1.AUTH_COOKIE_NAME];
        return this.auth.enableMfa(user, dto.code, sessionId, this.context(req).ip, this.context(req).userAgent);
    }
    async disableMfa(req, user, dto) {
        return this.auth.disableMfa(user, dto.code, this.context(req).ip, this.context(req).userAgent);
    }
};
exports.AuthController = AuthController;
__decorate([
    (0, common_1.Post)('register'),
    (0, common_1.UseGuards)(rate_limit_guard_1.RateLimitGuard),
    (0, rate_limit_guard_1.RateLimit)({ limit: 30, windowMs: 15 * 60 * 1000 }),
    __param(0, (0, common_1.Res)({ passthrough: true })),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, register_dto_1.RegisterDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "register", null);
__decorate([
    (0, common_1.Post)('login'),
    (0, common_1.UseGuards)(rate_limit_guard_1.RateLimitGuard),
    (0, rate_limit_guard_1.RateLimit)({ limit: 30, windowMs: 15 * 60 * 1000 }),
    __param(0, (0, common_1.Res)({ passthrough: true })),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, login_dto_1.LoginDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "login", null);
__decorate([
    (0, common_1.Post)('mfa/verify'),
    (0, common_1.UseGuards)(rate_limit_guard_1.RateLimitGuard),
    (0, rate_limit_guard_1.RateLimit)({ limit: 10, windowMs: 15 * 60 * 1000 }),
    __param(0, (0, common_1.Res)({ passthrough: true })),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, mfa_verify_dto_1.MfaVerifyDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "verifyMfa", null);
__decorate([
    (0, common_1.Post)('logout'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "logout", null);
__decorate([
    (0, common_1.Get)('me'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "me", null);
__decorate([
    (0, common_1.Post)('mfa/setup'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, mfa_setup_dto_1.MfaSetupDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "setupMfa", null);
__decorate([
    (0, common_1.Post)('mfa/enable'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, mfa_code_dto_1.MfaCodeDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "enableMfa", null);
__decorate([
    (0, common_1.Post)('mfa/disable'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, mfa_code_dto_1.MfaCodeDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "disableMfa", null);
exports.AuthController = AuthController = __decorate([
    (0, common_1.Controller)('auth'),
    __metadata("design:paramtypes", [auth_service_1.AuthService,
        audit_service_1.AuditService])
], AuthController);
//# sourceMappingURL=auth.controller.js.map