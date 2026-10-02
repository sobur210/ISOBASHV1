"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiProviderRegistry = void 0;
const common_1 = require("@nestjs/common");
const provider_types_1 = require("./provider.types");
let AiProviderRegistry = class AiProviderRegistry {
    providers = new Map();
    register(provider) {
        this.providers.set(provider.name, provider);
    }
    instance(name) {
        return this.providers.get(name);
    }
    names() {
        return [...this.providers.keys()];
    }
    list() {
        return [...this.providers.values()].map((provider) => ({
            provider: provider.name,
            status: 'unconfigured',
            capabilities: [...provider.capabilities],
            detail: 'Provider health has not been checked yet.',
        }));
    }
    capabilities() {
        return new Map([...this.providers.entries()].map(([name, provider]) => [name, provider.capabilities]));
    }
    async health() {
        return Promise.all([...this.providers.values()].map((provider) => provider.health()));
    }
    async execute(request) {
        const candidates = this.findProviders(request.capability, request.model);
        if (candidates.length === 0) {
            throw new provider_types_1.AiProviderError(`No configured provider supports ${request.capability}.`, 'registry', 'NO_PROVIDER_AVAILABLE');
        }
        let lastError;
        for (const provider of candidates) {
            const status = await provider.health();
            if (status.status !== 'healthy')
                continue;
            try {
                return await provider.execute(normalizeRequest(request, provider.name));
            }
            catch (error) {
                lastError = error instanceof provider_types_1.AiProviderError
                    ? error
                    : new provider_types_1.AiProviderError('Provider execution failed.', provider.name, 'PROVIDER_EXECUTION_FAILED');
            }
        }
        throw lastError || new provider_types_1.AiProviderError(`No healthy provider supports ${request.capability}.`, 'registry', 'NO_HEALTHY_PROVIDER');
    }
    findProviders(capability, model) {
        const candidates = [...this.providers.values()].filter((provider) => provider.capabilities.includes(capability));
        return model ? candidates.filter((provider) => provider.name === model || model.startsWith(`${provider.name}:`)) : candidates;
    }
    async *stream(request, signal) {
        const candidates = this.findProviders(request.capability, request.model);
        if (candidates.length === 0) {
            throw new provider_types_1.AiProviderError(`No configured provider supports ${request.capability}.`, 'registry', 'NO_PROVIDER_AVAILABLE');
        }
        for (const provider of candidates) {
            const status = await provider.health();
            if (status.status !== 'healthy')
                continue;
            if (!provider.stream) {
                try {
                    const response = await provider.execute(normalizeRequest(request, provider.name));
                    yield { type: 'delta', text: response.output };
                    yield { type: 'done', provider: response.provider, model: response.model, usage: response.usage };
                }
                catch (error) {
                    yield {
                        type: 'error',
                        code: error instanceof provider_types_1.AiProviderError ? error.code : 'PROVIDER_EXECUTION_FAILED',
                        message: error instanceof Error ? error.message : 'Provider execution failed.',
                    };
                }
                return;
            }
            try {
                yield* provider.stream(normalizeRequest(request, provider.name), signal);
            }
            catch (error) {
                yield {
                    type: 'error',
                    code: error instanceof provider_types_1.AiProviderError ? error.code : 'PROVIDER_STREAM_FAILED',
                    message: error instanceof Error ? error.message : 'Provider stream failed.',
                };
            }
            return;
        }
        throw new provider_types_1.AiProviderError(`No healthy provider supports ${request.capability}.`, 'registry', 'NO_HEALTHY_PROVIDER');
    }
};
exports.AiProviderRegistry = AiProviderRegistry;
exports.AiProviderRegistry = AiProviderRegistry = __decorate([
    (0, common_1.Injectable)()
], AiProviderRegistry);
function normalizeRequest(request, providerName) {
    if (!request.model)
        return request;
    if (request.model === providerName) {
        const { model: _model, ...rest } = request;
        return rest;
    }
    const prefix = `${providerName}:`;
    if (request.model.startsWith(prefix)) {
        const model = request.model.slice(prefix.length) || undefined;
        return { ...request, model };
    }
    return request;
}
//# sourceMappingURL=provider.registry.js.map