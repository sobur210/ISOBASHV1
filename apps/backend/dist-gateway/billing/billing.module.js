"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BillingModule = void 0;
const common_1 = require("@nestjs/common");
const auth_module_1 = require("../auth/auth.module");
const security_module_1 = require("../security/security.module");
const billing_controller_1 = require("./billing.controller");
const billing_service_1 = require("./billing.service");
const entitlements_service_1 = require("./entitlements.service");
let BillingModule = class BillingModule {
};
exports.BillingModule = BillingModule;
exports.BillingModule = BillingModule = __decorate([
    (0, common_1.Module)({
        // AuthModule supplies AuthService for AuthGuard; SecurityModule supplies
        // AuditService for the plan-change trail.
        imports: [auth_module_1.AuthModule, security_module_1.SecurityModule],
        controllers: [billing_controller_1.BillingController],
        providers: [billing_service_1.BillingService, entitlements_service_1.EntitlementsService],
        // EntitlementsService is exported because the files and media quota checks read
        // it: a plan is enforced by the services that already enforce a quota, not by a
        // check that only exists on the billing page.
        exports: [billing_service_1.BillingService, entitlements_service_1.EntitlementsService],
    })
], BillingModule);
//# sourceMappingURL=billing.module.js.map