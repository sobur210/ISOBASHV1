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
exports.RetrievalError = exports.WebRetrievalService = void 0;
const common_1 = require("@nestjs/common");
const net_1 = require("net");
const promises_1 = require("dns/promises");
const inject_config_1 = require("../shared/config/inject-config");
const document_text_1 = require("../shared/text/document-text");
const ALLOWED_CONTENT_TYPES = ['text/html', 'text/plain', 'application/xhtml+xml'];
const MAX_BYTES = 2_000_000;
/**
 * Phase 11 web retrieval.
 *
 * Every fetch is a server-side request, so the interesting part is what it refuses.
 * Before a single byte is read the hostname is resolved and every returned address is
 * checked against loopback, private, link-local, unique-local and reserved ranges, and
 * redirects are re-checked at each hop. A research answer that reads
 * `http://169.254.169.254/` or `file://` is an exfiltration bug, not a feature.
 *
 * `RESEARCH_ALLOW_PRIVATE_HOSTS=true` lifts the private-range block. It exists for
 * local verification against a fixture server and is off everywhere else.
 */
let WebRetrievalService = class WebRetrievalService {
    config;
    log = new common_1.Logger('WebRetrieval');
    constructor(config) {
        this.config = config;
    }
    get privateHostsAllowed() {
        return this.config.research.allowPrivateHosts;
    }
    async retrieveMany(urls) {
        const sources = [];
        const failures = [];
        for (const url of urls.slice(0, this.config.research.maxSources)) {
            try {
                sources.push(await this.retrieve(url));
            }
            catch (error) {
                const code = error instanceof RetrievalError ? error.code : 'FETCH_FAILED';
                const detail = error instanceof Error ? error.message : 'The fetch failed.';
                this.log.warn(`Refused ${url}: ${code} ${detail}`);
                failures.push({ url, code, detail });
            }
        }
        return { sources, failures };
    }
    async retrieve(rawUrl) {
        let url;
        try {
            url = new URL(rawUrl);
        }
        catch {
            throw new RetrievalError('That is not a valid absolute URL.', 'INVALID_URL');
        }
        if (url.protocol !== 'https:' && url.protocol !== 'http:') {
            throw new RetrievalError(`Refusing the ${url.protocol} scheme; only http and https are retrieved.`, 'UNSUPPORTED_SCHEME');
        }
        if (url.username || url.password) {
            throw new RetrievalError('Refusing a URL that carries credentials.', 'UNSUPPORTED_URL');
        }
        const redirects = [];
        let current = url;
        for (let hop = 0; hop <= 3; hop += 1) {
            await this.assertPublicHost(current);
            const response = await this.request(current);
            if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
                redirects.push(`${response.status} -> ${response.headers.get('location')}`);
                current = new URL(response.headers.get('location'), current);
                continue;
            }
            return this.readBody(url, current, response);
        }
        throw new RetrievalError('Too many redirects.', 'TOO_MANY_REDIRECTS');
    }
    /** DNS-resolve and reject anything that is not a public unicast address. */
    async assertPublicHost(url) {
        if (this.privateHostsAllowed) {
            return;
        }
        const host = url.hostname.replace(/^\[|\]$/g, '');
        const direct = (0, net_1.isIP)(host);
        const addresses = direct
            ? [{ address: host, family: direct }]
            : await (0, promises_1.lookup)(host, { all: true }).catch(() => {
                throw new RetrievalError(`Could not resolve ${host}.`, 'DNS_FAILURE');
            });
        for (const entry of addresses) {
            if (this.isBlockedAddress(entry.address)) {
                throw new RetrievalError(`Refusing to fetch ${entry.address}: private, loopback and link-local addresses are not retrievable.`, 'PRIVATE_ADDRESS');
            }
        }
    }
    isBlockedAddress(address) {
        const type = (0, net_1.isIP)(address);
        if (type === 4) {
            const [a, b] = address.split('.').map(Number);
            if (a === 0 || a === 10 || a === 127)
                return true;
            if (a === 172 && b >= 16 && b <= 31)
                return true;
            if (a === 192 && b === 168)
                return true;
            if (a === 169 && b === 254)
                return true;
            if (a === 100 && b >= 64 && b <= 127)
                return true;
            if (a >= 224)
                return true;
            return false;
        }
        if (type === 6) {
            const lower = address.toLowerCase();
            if (lower === '::1' || lower === '::')
                return true;
            if (lower.startsWith('fe80') || lower.startsWith('fc') || lower.startsWith('fd'))
                return true;
            // IPv4-mapped addresses must be checked as IPv4 or ::ffff:127.0.0.1 walks in.
            const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
            if (mapped)
                return this.isBlockedAddress(mapped[1]);
            return false;
        }
        return true;
    }
    request(url) {
        return fetch(url, {
            redirect: 'manual',
            signal: AbortSignal.timeout(this.config.research.fetchTimeoutMs),
            headers: {
                'user-agent': 'ISOBASH-Research/1.0 (+https://isobash.local)',
                accept: 'text/html,text/plain;q=0.9',
            },
        });
    }
    async readBody(requested, landed, response) {
        const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
        if (!response.ok) {
            throw new RetrievalError(`The server answered ${response.status}.`, 'HTTP_ERROR');
        }
        if (contentType && !ALLOWED_CONTENT_TYPES.some((allowed) => contentType.includes(allowed))) {
            throw new RetrievalError(`Refusing the ${contentType} content type.`, 'UNSUPPORTED_CONTENT_TYPE');
        }
        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.byteLength > MAX_BYTES) {
            throw new RetrievalError(`The response is ${buffer.byteLength} bytes, over the ${MAX_BYTES} byte ceiling.`, 'RESOURCE_LIMIT');
        }
        const raw = buffer.toString('utf8');
        const text = (0, document_text_1.looksLikeHtml)(contentType, raw) ? (0, document_text_1.extractHtmlText)(raw) : raw;
        const limit = this.config.research.maxCharactersPerSource;
        const capped = text.length > limit;
        return {
            // The requested URL is the identity of the source, so a redirect updates the row the
            // caller asked about instead of leaving it PENDING next to a duplicate of the target.
            url: requested.toString(),
            finalUrl: (response.url || landed).toString(),
            title: extractTitle(raw, contentType),
            host: landed.hostname,
            status: response.status,
            text: (0, document_text_1.normaliseText)(text).slice(0, limit),
            characters: Math.min(text.length, limit),
            truncated: capped,
        };
    }
};
exports.WebRetrievalService = WebRetrievalService;
exports.WebRetrievalService = WebRetrievalService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, inject_config_1.InjectConfig)()),
    __metadata("design:paramtypes", [Object])
], WebRetrievalService);
class RetrievalError extends Error {
    code;
    constructor(message, code) {
        super(message);
        this.code = code;
        this.name = 'RetrievalError';
    }
}
exports.RetrievalError = RetrievalError;
/** An HTML page is titled by its `<title>`; plain text by its first real line. */
function extractTitle(raw, contentType) {
    if (contentType.includes('html')) {
        return (0, document_text_1.extractHtmlTitle)(raw);
    }
    const first = raw.split('\n').find((line) => line.trim().length > 0) ?? '';
    return first.trim() ? first.trim().slice(0, 300) : null;
}
//# sourceMappingURL=web-retrieval.service.js.map