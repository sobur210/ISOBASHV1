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
exports.RolesGuard = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const roles_decorator_1 = require("./roles.decorator");
const audit_service_1 = require("../security/audit.service");
let RolesGuard = class RolesGuard {
    reflector;
    audit;
    logger = new common_1.Logger('RolesGuard');
    constructor(reflector, audit) {
        this.reflector = reflector;
        this.audit = audit;
    }
    async canActivate(context) {
        const requiredRoles = this.reflector.getAllAndOverride(roles_decorator_1.ROLES_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (!requiredRoles || requiredRoles.length === 0) {
            return true;
        }
        const request = context.switchToHttp().getRequest();
        const user = request.user;
        const contextInfo = this.audit.fromRequest(request);
        if (!user || !requiredRoles.includes(user.role)) {
            this.logger.warn(`Role guard denied ${request.method} ${request.url} for role ${user?.role ?? 'none'}`);
            await this.audit.log({
                category: 'AUTHORIZATION',
                action: 'forbidden',
                actorId: user?.id,
                actorEmail: user?.email,
                ip: contextInfo.ip,
                userAgent: contextInfo.userAgent,
                metadata: { method: request.method, path: request.url, requiredRoles },
            });
            throw new common_1.ForbiddenException('You do not have permission to access this resource.');
        }
        await this.audit.log({
            category: 'ADMIN',
            action: 'admin_access',
            actorId: user.id,
            actorEmail: user.email,
            ip: contextInfo.ip,
            userAgent: contextInfo.userAgent,
            metadata: { method: request.method, path: request.url },
        });
        return true;
    }
};
exports.RolesGuard = RolesGuard;
exports.RolesGuard = RolesGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.Reflector,
        audit_service_1.AuditService])
], RolesGuard);
//# sourceMappingURL=roles.guard.js.map