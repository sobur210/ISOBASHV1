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
exports.AiController = void 0;
const common_1 = require("@nestjs/common");
const provider_registry_1 = require("./provider.registry");
const model_registry_1 = require("./model.registry");
const capability_registry_1 = require("./capability.registry");
const tools_registry_1 = require("./tools.registry");
const ai_router_service_1 = require("./ai-router.service");
const provider_health_service_1 = require("./provider-health.service");
const generate_request_dto_1 = require("./dto/generate-request.dto");
const route_preview_dto_1 = require("./dto/route-preview.dto");
let AiController = class AiController {
    registry;
    models;
    capabilities;
    tools;
    router;
    health;
    constructor(registry, models, capabilities, tools, router, health) {
        this.registry = registry;
        this.models = models;
        this.capabilities = capabilities;
        this.tools = tools;
        this.router = router;
        this.health = health;
    }
    listProviders() {
        return this.registry.list();
    }
    async getProviderHealth() {
        const live = await this.registry.health();
        const stats = new Map((await this.health.snapshotWithHealth()).map((entry) => [entry.provider, entry]));
        return live.map((entry) => ({ ...entry, runtime: stats.get(entry.provider) ?? null }));
    }
    listModels() {
        return this.models.list();
    }
    listCapabilities() {
        return this.capabilities.list(this.registry.capabilities());
    }
    listTools() {
        return this.tools.list();
    }
    /** Phase 9: live routing table of health, circuit state, reliability and latency. */
    async routingTable() {
        return {
            defaultMode: this.router.mode(),
            providers: await this.health.snapshotWithHealth(),
            models: this.models.list().map((model) => ({ ...model, autoSelectable: model.enabled !== false })),
            policy: {
                failoverAllowed: ['PROVIDER_UNAVAILABLE', 'PROVIDER_STREAM_FAILED', 'EMPTY_PROVIDER_RESPONSE', 'PROVIDER_TIMEOUT', 'STREAM_INTERRUPTED'],
                failoverBlocked: ['RATE_LIMITED', 'INVALID_API_KEY', 'PROVIDER_NOT_CONFIGURED', 'MODEL_NOT_AVAILABLE', 'PROVIDER_OVERLOADED', 'CAPABILITY_UNSUPPORTED'],
                note: 'An explicit provider selection is always strict: no cross-provider fallback. Provider errors that are real answers are surfaced verbatim.',
            },
        };
    }
    /** Phase 9: preview a routing decision without executing a model call. */
    async previewRoute(request) {
        return this.router.plan({ capability: request.capability, mode: request.mode, model: request.model });
    }
    routingPreview(capability, mode, model) {
        return this.router.plan({
            capability: capability ?? 'language',
            mode: mode,
            model,
        });
    }
    generate(request) {
        return this.router.execute(request);
    }
};
exports.AiController = AiController;
__decorate([
    (0, common_1.Get)('providers'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AiController.prototype, "listProviders", null);
__decorate([
    (0, common_1.Get)('providers/health'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AiController.prototype, "getProviderHealth", null);
__decorate([
    (0, common_1.Get)('models'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AiController.prototype, "listModels", null);
__decorate([
    (0, common_1.Get)('capabilities'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AiController.prototype, "listCapabilities", null);
__decorate([
    (0, common_1.Get)('tools'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AiController.prototype, "listTools", null);
__decorate([
    (0, common_1.Get)('routing'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AiController.prototype, "routingTable", null);
__decorate([
    (0, common_1.Post)('route'),
    (0, common_1.UsePipes)(new common_1.ValidationPipe({ whitelist: true, forbidNonWhitelisted: false })),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [route_preview_dto_1.RoutePreviewDto]),
    __metadata("design:returntype", Promise)
], AiController.prototype, "previewRoute", null);
__decorate([
    (0, common_1.Get)('route'),
    __param(0, (0, common_1.Query)('capability')),
    __param(1, (0, common_1.Query)('mode')),
    __param(2, (0, common_1.Query)('model')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", void 0)
], AiController.prototype, "routingPreview", null);
__decorate([
    (0, common_1.Post)('generate'),
    (0, common_1.UsePipes)(new common_1.ValidationPipe({ whitelist: true, forbidNonWhitelisted: false })),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [generate_request_dto_1.GenerateRequestDto]),
    __metadata("design:returntype", void 0)
], AiController.prototype, "generate", null);
exports.AiController = AiController = __decorate([
    (0, common_1.Controller)('ai'),
    __metadata("design:paramtypes", [provider_registry_1.AiProviderRegistry,
        model_registry_1.AiModelRegistry,
        capability_registry_1.AiCapabilityRegistry,
        tools_registry_1.AiToolsRegistry,
        ai_router_service_1.AiRouterService,
        provider_health_service_1.ProviderHealthService])
], AiController);
//# sourceMappingURL=ai.controller.js.map