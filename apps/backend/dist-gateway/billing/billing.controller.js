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
exports.BillingController = void 0;
const common_1 = require("@nestjs/common");
const auth_guard_1 = require("../auth/auth.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const billing_service_1 = require("./billing.service");
let BillingController = class BillingController {
    billing;
    constructor(billing) {
        this.billing = billing;
    }
    /**
     * Public to any signed-in account, and safe to call without one: it describes
     * the deployment, not the caller. There is deliberately no `paymentMethods`
     * array here, because there is no processor to hold one.
     */
    capabilities() {
        return this.billing.capabilities();
    }
    subscription(user) {
        return this.billing.subscription(user.id);
    }
    usage(user) {
        return this.billing.usage(user.id);
    }
    /**
     * Returning to the Free plan is the one billing action a user can take. It is
     * `DELETE` on purpose: the account stops holding an entitlement, which is what
     * removing the row means. Upgrading is not exposed here at all — see
     * `capabilities().selfService`.
     */
    downgrade(user) {
        return this.billing.downgrade(user);
    }
};
exports.BillingController = BillingController;
__decorate([
    (0, common_1.Get)('capabilities'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], BillingController.prototype, "capabilities", null);
__decorate([
    (0, common_1.Get)('subscription'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], BillingController.prototype, "subscription", null);
__decorate([
    (0, common_1.Get)('usage'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], BillingController.prototype, "usage", null);
__decorate([
    (0, common_1.HttpCode)(200),
    (0, common_1.Delete)('subscription'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], BillingController.prototype, "downgrade", null);
exports.BillingController = BillingController = __decorate([
    (0, common_1.Controller)('billing'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __metadata("design:paramtypes", [billing_service_1.BillingService])
], BillingController);
//# sourceMappingURL=billing.controller.js.map