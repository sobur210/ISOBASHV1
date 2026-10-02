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
exports.ResearchController = void 0;
const common_1 = require("@nestjs/common");
const auth_guard_1 = require("../auth/auth.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const rate_limit_guard_1 = require("../security/rate-limit.guard");
const research_dto_1 = require("./dto/research.dto");
const research_service_1 = require("./research.service");
let ResearchController = class ResearchController {
    research;
    constructor(research) {
        this.research = research;
    }
    /** What research can actually do right now, reported honestly. */
    capabilities() {
        return this.research.capabilities();
    }
    list(user) {
        return this.research.list(user.id);
    }
    get(user, id) {
        return this.research.get(user.id, id);
    }
    start(user, body) {
        return this.research.start(user, {
            question: body.question,
            ...(body.urls ? { urls: body.urls } : {}),
            ...(body.projectId !== undefined ? { projectId: body.projectId } : {}),
            ...(body.model ? { model: body.model } : {}),
        });
    }
    remove(user, id) {
        return this.research.remove(user.id, id);
    }
};
exports.ResearchController = ResearchController;
__decorate([
    (0, common_1.Get)('capabilities'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ResearchController.prototype, "capabilities", null);
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ResearchController.prototype, "list", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ResearchController.prototype, "get", null);
__decorate([
    (0, common_1.Post)(),
    (0, common_1.UseGuards)(rate_limit_guard_1.RateLimitGuard),
    (0, rate_limit_guard_1.RateLimit)({ limit: 20, windowMs: 15 * 60 * 1000 }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, research_dto_1.StartResearchDto]),
    __metadata("design:returntype", void 0)
], ResearchController.prototype, "start", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, common_1.HttpCode)(204),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ResearchController.prototype, "remove", null);
exports.ResearchController = ResearchController = __decorate([
    (0, common_1.Controller)('research'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __metadata("design:paramtypes", [research_service_1.ResearchService])
], ResearchController);
//# sourceMappingURL=research.controller.js.map