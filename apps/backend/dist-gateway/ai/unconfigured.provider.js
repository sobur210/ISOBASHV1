"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UnconfiguredAiProvider = void 0;
const provider_types_1 = require("./provider.types");
class UnconfiguredAiProvider {
    name = 'unconfigured';
    capabilities = ['language', 'vision', 'embeddings', 'image-generation', 'video-generation', 'research'];
    async health() {
        return {
            provider: this.name,
            status: 'unconfigured',
            capabilities: [...this.capabilities],
            detail: 'Configure a real provider adapter before requesting AI execution.',
        };
    }
    async execute(_request) {
        throw new provider_types_1.AiProviderError('AI provider configuration is required before execution.', this.name, 'PROVIDER_NOT_CONFIGURED');
    }
}
exports.UnconfiguredAiProvider = UnconfiguredAiProvider;
//# sourceMappingURL=unconfigured.provider.js.map