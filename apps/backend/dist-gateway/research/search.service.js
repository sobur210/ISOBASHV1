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
exports.SearchService = void 0;
const common_1 = require("@nestjs/common");
const inject_config_1 = require("../shared/config/inject-config");
const ENDPOINT = 'https://api.search.brave.com/res/v1/web/search';
/**
 * Phase 11 web search.
 *
 * Search is a real HTTP call to a real provider, so it is only ever available when a
 * key is configured. With no key this reports `available: false` with the reason, and
 * research falls back to the sources the caller supplied. It never invents results.
 */
let SearchService = class SearchService {
    config;
    log = new common_1.Logger('WebSearch');
    constructor(config) {
        this.config = config;
    }
    get enabled() {
        return Boolean(this.config.research.braveApiKey);
    }
    async search(query) {
        if (!this.enabled) {
            return {
                available: false,
                provider: null,
                detail: 'No web search provider is configured (BRAVE_SEARCH_API_KEY is unset), so only supplied URLs are retrieved.',
                hits: [],
            };
        }
        try {
            const response = await fetch(`${ENDPOINT}?q=${encodeURIComponent(query)}&count=${this.config.research.maxSources}`, {
                headers: {
                    accept: 'application/json',
                    'x-subscription-token': this.config.research.braveApiKey,
                },
                signal: AbortSignal.timeout(this.config.research.fetchTimeoutMs),
            });
            if (!response.ok) {
                throw new Error(`the search provider answered ${response.status}`);
            }
            const body = (await response.json());
            const hits = (body.web?.results ?? [])
                .filter((row) => typeof row.url === 'string')
                .map((row) => ({ url: row.url, title: row.title ?? null, snippet: row.description ?? null }));
            return { available: true, provider: 'brave', detail: `Brave returned ${hits.length} result(s).`, hits };
        }
        catch (error) {
            const detail = error instanceof Error ? error.message : 'the search call failed.';
            this.log.warn(`Web search failed: ${detail}`);
            return { available: false, provider: 'brave', detail: `Web search failed: ${detail}`, hits: [] };
        }
    }
};
exports.SearchService = SearchService;
exports.SearchService = SearchService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, inject_config_1.InjectConfig)()),
    __metadata("design:paramtypes", [Object])
], SearchService);
//# sourceMappingURL=search.service.js.map