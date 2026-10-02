"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecurityModule = void 0;
const common_1 = require("@nestjs/common");
const prisma_module_1 = require("../prisma/prisma.module");
const config_module_1 = require("../shared/config/config.module");
const audit_service_1 = require("./audit.service");
const rate_limit_service_1 = require("./rate-limit.service");
const rate_limit_guard_1 = require("./rate-limit.guard");
const secret_cipher_1 = require("./secret-cipher");
let SecurityModule = class SecurityModule {
};
exports.SecurityModule = SecurityModule;
exports.SecurityModule = SecurityModule = __decorate([
    (0, common_1.Module)({
        imports: [prisma_module_1.PrismaModule],
        providers: [
            audit_service_1.AuditService,
            rate_limit_service_1.RateLimitService,
            rate_limit_guard_1.RateLimitGuard,
            {
                provide: secret_cipher_1.SecretCipher,
                useFactory: (config) => new secret_cipher_1.SecretCipher(config.security.appSecret),
                inject: [config_module_1.CONFIG],
            },
        ],
        exports: [audit_service_1.AuditService, rate_limit_service_1.RateLimitService, rate_limit_guard_1.RateLimitGuard, secret_cipher_1.SecretCipher],
    })
], SecurityModule);
//# sourceMappingURL=security.module.js.map