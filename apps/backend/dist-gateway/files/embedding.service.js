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
exports.EmbeddingService = void 0;
const common_1 = require("@nestjs/common");
const ai_router_service_1 = require("../ai/ai-router.service");
const provider_types_1 = require("../ai/provider.types");
const inject_config_1 = require("../shared/config/inject-config");
/**
 * Phase 12 embeddings.
 *
 * Knowledge search has two halves: keyword matching always works, and vector
 * similarity works when a provider can really produce vectors. This service
 * reports which of the two is live instead of pretending both are, and never
 * substitutes one provider's vectors for another's mid-index.
 */
let EmbeddingService = class EmbeddingService {
    ai;
    config;
    log = new common_1.Logger('Embedding');
    cache = null;
    constructor(ai, config) {
        this.ai = ai;
        this.config = config;
    }
    get enabled() {
        return this.config.files.embeddingsEnabled;
    }
    /** What embedding support exists right now, with the reason when it does not. */
    async availability() {
        if (!this.enabled) {
            return {
                available: false,
                provider: null,
                model: null,
                dimensions: null,
                detail: 'Embeddings are switched off (FILES_EMBEDDINGS_ENABLED=false); knowledge search runs on keyword matching only.',
            };
        }
        if (this.cache && Date.now() - this.cache.at < 60_000) {
            return this.cache.value;
        }
        const value = await this.probe();
        this.cache = { at: Date.now(), value };
        return value;
    }
    async embed(inputs, taskType = 'RETRIEVAL_DOCUMENT') {
        if (inputs.length === 0) {
            throw new Error('No input to embed.');
        }
        const { embeddingsProvider, embeddingsModel } = this.config.files;
        const response = await this.ai.embed({
            capability: 'embeddings',
            inputs,
            ...(embeddingsProvider !== 'auto' ? { model: embeddingsModel ? `${embeddingsProvider}:${embeddingsModel}` : embeddingsProvider } : embeddingsModel ? { model: embeddingsModel } : {}),
            taskType,
        });
        return {
            provider: response.provider,
            model: response.model,
            dimensions: response.dimensions,
            vectors: response.embeddings,
        };
    }
    /** Embed, but answer honestly instead of throwing when nothing is available. */
    async tryEmbed(inputs, taskType = 'RETRIEVAL_DOCUMENT') {
        if (!this.enabled) {
            return { error: 'Embeddings are switched off (FILES_EMBEDDINGS_ENABLED=false).' };
        }
        try {
            return { batch: await this.embed(inputs, taskType) };
        }
        catch (error) {
            const message = error instanceof provider_types_1.AiProviderError ? `${error.provider}: ${error.message}` : error instanceof Error ? error.message : 'The embedding call failed.';
            this.log.warn(`Embedding failed: ${message}`);
            // A failure is not cached as an answer: the next upload tries again.
            this.cache = null;
            return { error: message };
        }
    }
    async probe() {
        const { embeddingsProvider, embeddingsModel } = this.config.files;
        const selection = embeddingsProvider === 'auto'
            ? embeddingsModel
                ? embeddingsModel
                : undefined
            : embeddingsModel
                ? `${embeddingsProvider}:${embeddingsModel}`
                : embeddingsProvider;
        try {
            const probeResult = await this.embed(['isobash embedding probe'], 'RETRIEVAL_QUERY');
            return {
                available: true,
                provider: probeResult.provider,
                model: probeResult.model,
                dimensions: probeResult.dimensions,
                detail: `Embeddings are available through ${probeResult.provider}:${probeResult.model} (${probeResult.dimensions} dimensions).`,
            };
        }
        catch (error) {
            const message = error instanceof provider_types_1.AiProviderError
                ? `${error.code}: ${error.message}`
                : error instanceof Error
                    ? error.message
                    : 'The embedding provider could not be reached.';
            this.log.warn(`Embedding probe failed: ${message}`);
            return {
                available: false,
                provider: null,
                model: selection ?? null,
                dimensions: null,
                detail: `No embedding provider answered (${message}). Knowledge search falls back to keyword matching.`,
            };
        }
    }
};
exports.EmbeddingService = EmbeddingService;
exports.EmbeddingService = EmbeddingService = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, inject_config_1.InjectConfig)()),
    __metadata("design:paramtypes", [ai_router_service_1.AiRouterService, Object])
], EmbeddingService);
//# sourceMappingURL=embedding.service.js.map