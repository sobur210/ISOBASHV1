"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiCapabilityRegistry = void 0;
const common_1 = require("@nestjs/common");
let AiCapabilityRegistry = class AiCapabilityRegistry {
    capabilities = [
        'language',
        'vision',
        'embeddings',
        'image-generation',
        'video-generation',
        'research',
    ];
    list(providerCapabilities) {
        return this.capabilities.map((capability) => {
            const providers = [...providerCapabilities.entries()]
                .filter(([, capabilities]) => capabilities.includes(capability))
                .map(([provider]) => provider);
            return {
                capability,
                status: providers.length > 0 ? 'available' : 'unavailable',
                providers,
                detail: providers.length > 0
                    ? `Available through ${providers.join(', ')}.`
                    : 'No configured provider currently supports this capability.',
            };
        });
    }
};
exports.AiCapabilityRegistry = AiCapabilityRegistry;
exports.AiCapabilityRegistry = AiCapabilityRegistry = __decorate([
    (0, common_1.Injectable)()
], AiCapabilityRegistry);
//# sourceMappingURL=capability.registry.js.map