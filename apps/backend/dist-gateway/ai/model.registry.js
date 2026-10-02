"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiModelRegistry = void 0;
const common_1 = require("@nestjs/common");
let AiModelRegistry = class AiModelRegistry {
    models = new Map();
    register(model) {
        this.models.set(model.id, model);
    }
    list() {
        return [...this.models.values()];
    }
    get(id) {
        return this.models.get(id);
    }
    modelsFor(provider) {
        return this.list().filter((model) => model.provider === provider);
    }
    find(capability, mode = 'hybrid') {
        return [...this.models.values()].filter((model) => model.capabilities.includes(capability) && model.modes.includes(mode));
    }
    /** Models the router is allowed to select automatically. */
    routable(capability, mode) {
        return this.find(capability, mode).filter((model) => model.enabled !== false);
    }
};
exports.AiModelRegistry = AiModelRegistry;
exports.AiModelRegistry = AiModelRegistry = __decorate([
    (0, common_1.Injectable)()
], AiModelRegistry);
//# sourceMappingURL=model.registry.js.map