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
exports.AgentsController = void 0;
const common_1 = require("@nestjs/common");
const auth_guard_1 = require("../auth/auth.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const rate_limit_guard_1 = require("../security/rate-limit.guard");
const agent_runner_service_1 = require("./agent-runner.service");
const agents_service_1 = require("./agents.service");
const agent_dto_1 = require("./dto/agent.dto");
let AgentsController = class AgentsController {
    agents;
    runner;
    constructor(agents, runner) {
        this.agents = agents;
        this.runner = runner;
    }
    list(user) {
        return this.agents.list(user.id);
    }
    getRun(user, runId) {
        return this.runner.getRun(user.id, runId);
    }
    cancelRun(user, runId) {
        return this.runner.cancel(user, runId);
    }
    get(user, id) {
        return this.agents.get(user.id, id);
    }
    listRuns(user, id) {
        return this.runner.listRuns(user.id, id);
    }
    create(user, body) {
        return this.agents.create(user.id, body);
    }
    update(user, id, body) {
        return this.agents.update(user.id, id, body);
    }
    remove(user, id) {
        return this.agents.remove(user.id, id);
    }
    /** Model calls are metered per user so one agent cannot burn the whole quota. */
    startRun(user, id, body) {
        return this.runner.start(user, id, body.input);
    }
};
exports.AgentsController = AgentsController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AgentsController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('runs/:runId'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('runId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], AgentsController.prototype, "getRun", null);
__decorate([
    (0, common_1.Post)('runs/:runId/cancel'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('runId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], AgentsController.prototype, "cancelRun", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], AgentsController.prototype, "get", null);
__decorate([
    (0, common_1.Get)(':id/runs'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], AgentsController.prototype, "listRuns", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, agent_dto_1.CreateAgentDto]),
    __metadata("design:returntype", void 0)
], AgentsController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, agent_dto_1.UpdateAgentDto]),
    __metadata("design:returntype", void 0)
], AgentsController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, common_1.HttpCode)(204),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], AgentsController.prototype, "remove", null);
__decorate([
    (0, common_1.Post)(':id/runs'),
    (0, common_1.UseGuards)(rate_limit_guard_1.RateLimitGuard),
    (0, rate_limit_guard_1.RateLimit)({ limit: 20, windowMs: 15 * 60 * 1000 }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, agent_dto_1.StartAgentRunDto]),
    __metadata("design:returntype", void 0)
], AgentsController.prototype, "startRun", null);
exports.AgentsController = AgentsController = __decorate([
    (0, common_1.Controller)('agents'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __metadata("design:paramtypes", [agents_service_1.AgentsService,
        agent_runner_service_1.AgentRunnerService])
], AgentsController);
//# sourceMappingURL=agents.controller.js.map