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
exports.MemoryController = void 0;
const common_1 = require("@nestjs/common");
const auth_guard_1 = require("../auth/auth.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const rate_limit_guard_1 = require("../security/rate-limit.guard");
const create_memory_dto_1 = require("./dto/create-memory.dto");
const memory_service_1 = require("./memory.service");
let MemoryController = class MemoryController {
    memory;
    constructor(memory) {
        this.memory = memory;
    }
    list(user, agentId, query, limit) {
        return this.memory.list({ userId: user.id, ...(agentId ? { agentId } : {}) }, { ...(query ? { query } : {}), ...(limit ? { limit: Number(limit) } : {}) });
    }
    stats(user) {
        return this.memory.stats(user.id);
    }
    create(user, body) {
        return this.memory.create({ userId: user.id, ...(body.agentId ? { agentId: body.agentId } : {}) }, { content: body.content, ...(body.kind ? { kind: body.kind } : {}) });
    }
    remove(user, id) {
        return this.memory.remove({ userId: user.id }, id);
    }
};
exports.MemoryController = MemoryController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('agentId')),
    __param(2, (0, common_1.Query)('q')),
    __param(3, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String]),
    __metadata("design:returntype", void 0)
], MemoryController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('stats'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], MemoryController.prototype, "stats", null);
__decorate([
    (0, common_1.Post)(),
    (0, common_1.UseGuards)(rate_limit_guard_1.RateLimitGuard),
    (0, rate_limit_guard_1.RateLimit)({ limit: 120, windowMs: 15 * 60 * 1000 }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, create_memory_dto_1.CreateMemoryDto]),
    __metadata("design:returntype", void 0)
], MemoryController.prototype, "create", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, common_1.HttpCode)(204),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], MemoryController.prototype, "remove", null);
exports.MemoryController = MemoryController = __decorate([
    (0, common_1.Controller)('memory'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __metadata("design:paramtypes", [memory_service_1.MemoryService])
], MemoryController);
//# sourceMappingURL=memory.controller.js.map