"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminModule = void 0;
const common_1 = require("@nestjs/common");
const auth_module_1 = require("../auth/auth.module");
const ai_module_1 = require("../ai/ai.module");
const queue_module_1 = require("../queues/queue.module");
const billing_module_1 = require("../billing/billing.module");
const admin_controller_1 = require("./admin.controller");
const admin_users_service_1 = require("./admin-users.service");
const admin_settings_service_1 = require("./admin-settings.service");
const admin_shell_service_1 = require("./admin-shell.service");
const system_health_service_1 = require("./system-health.service");
let AdminModule = class AdminModule {
};
exports.AdminModule = AdminModule;
exports.AdminModule = AdminModule = __decorate([
    (0, common_1.Module)({
        // AiModule for the credit pool summary. It is a read of a shared budget, so it
        // belongs to the AI module that meters it rather than to a local copy here.
        // BillingModule for the one path that grants a plan.
        imports: [auth_module_1.AuthModule, queue_module_1.QueueModule, ai_module_1.AiModule, billing_module_1.BillingModule],
        controllers: [admin_controller_1.AdminController],
        providers: [system_health_service_1.SystemHealthService, admin_users_service_1.AdminUsersService, admin_settings_service_1.AdminSettingsService, admin_shell_service_1.AdminShellService],
    })
], AdminModule);
//# sourceMappingURL=admin.module.js.map