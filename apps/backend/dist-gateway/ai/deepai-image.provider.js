"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeepAiImageProvider = exports.DEEPAI_IMAGE_COST_PER_CALL = void 0;
const common_1 = require("@nestjs/common");
const provider_types_1 = require("./provider.types");
const deepai_pricing_1 = require("./deepai.pricing");
const DEFAULT_BASE_URL = 'https://api.deepai.org';
const REQUEST_TIMEOUT_MS = Number(process.env.DEEPAI_IMAGE_TIMEOUT_MS || 120_000);
const DOWNLOAD_TIMEOUT_MS = Number(process.env.DEEPAI_IMAGE_DOWNLOAD_TIMEOUT_MS || 60_000);
/**
 * Refuse an oversized download rather than buffering an unbounded image in memory.
 *
 * Read per instance rather than once at import, so it is settled when the provider
 * is built instead of when the module happened to be loaded, matching how
 * `baseUrl` and the timeouts are resolved.
 */
const DEFAULT_MAX_DOWNLOAD_BYTES = 40 * 1024 * 1024;
/** The image endpoint takes 128-1536px edges, so a square request is normalised. */
const EDGE_MIN = 128;
const EDGE_MAX = 1536;
/** One DeepAI image is billed per call, which is a different currency to video seconds. */
exports.DEEPAI_IMAGE_COST_PER_CALL = 1;
const EDGE_BY_RATIO = {
    '1:1': 1024,
    '3:4': 896,
    '4:3': 1152,
    '9:16': 768,
    '16:9': 1344,
};
/**
 * DeepAI image generation, on the same optional `generateImage` method every other
 * image provider uses.
 *
 * There is no separate `ImageProvider` interface in this codebase: images are the
 * optional `generateImage()` on `AiProvider`, mirroring how `generateVideo()` works
 * for video. So this is a plain `AiProvider` that also happens to produce images,
 * registered only when `DEEPAI_ENABLED` is set, and it slots into the existing
 * router with no change to the media service, the UI or the failover chain.
 *
 * THE FREE TIER HERE IS NOT FREE, AND THIS IS THE PART TO READ.
 *
 * DeepAI's docs describe the image APIs as "included with DeepAI Pro", and the
 * per-call price for `text2img` is 1 credit per call -- which is money, drawn from
 * the same paid subscription that unlocks video. Unlike the video API there is no
 * monthly video allowance being drawn down, but there is no genuinely free tier
 * either: a key without an active Pro subscription is refused.
 *
 * So this provider is registered as opt-in and reports `unconfigured` without a key,
 * and the health detail says plainly that Pro is required. It is not offered as a
 * free fallback to Gemini or Pollinations, because it is not free.
 *
 * The endpoint answers with an `output_url` on DeepAI's CDN rather than bytes, so
 * the image is downloaded and returned inline, exactly as the Gemini image path
 * does. That URL is not stored or linked: ISOBASH keeps its own copy.
 */
let DeepAiImageProvider = class DeepAiImageProvider {
    name = 'deepai';
    capabilities = ['image-generation'];
    models = [deepai_pricing_1.DEEPAI_IMAGE_MODEL];
    baseUrl = (process.env.DEEPAI_IMAGE_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
    maxDownloadBytes = Number(process.env.DEEPAI_IMAGE_MAX_BYTES || DEFAULT_MAX_DOWNLOAD_BYTES);
    get apiKey() {
        return process.env.DEEPAI_API_KEY || undefined;
    }
    async health() {
        if (!this.apiKey) {
            return {
                provider: this.name,
                status: 'unconfigured',
                capabilities: [...this.capabilities],
                detail: 'DEEPAI_API_KEY is not configured, so no image can be generated.',
            };
        }
        return {
            provider: this.name,
            status: 'healthy',
            capabilities: [...this.capabilities],
            detail: `Image generation through DeepAI (${deepai_pricing_1.DEEPAI_IMAGE_MODEL}). Each call is billed at ` +
                `${exports.DEEPAI_IMAGE_COST_PER_CALL} credit, and DeepAI's image APIs require an active paid DeepAI Pro subscription, ` +
                `so this is a paid renderer and not a free fallback. Edges are capped at ${EDGE_MAX}px.`,
        };
    }
    /** DeepAI images are generated; `execute` exists only to satisfy the AI interface. */
    async execute(request) {
        throw new provider_types_1.AiProviderError(`DeepAI image generation only generates images; it cannot serve ${request.capability}.`, this.name, 'CAPABILITY_UNSUPPORTED');
    }
    /**
     * One `text2img` call produces one image.
     *
     * `count` is handled by the router as N separate calls, exactly as it is for every
     * other image provider, rather than by faking an N-image response from one call:
     * DeepAI bills per call, so four images cost four credits and a single call that
     * claimed four would be a lie.
     */
    async generateImage(request) {
        const key = this.requireKey();
        const prompt = request.prompt.trim();
        if (!prompt) {
            throw new provider_types_1.AiProviderError('An image prompt is required.', this.name, 'INVALID_REQUEST');
        }
        if (prompt.length > deepai_pricing_1.DEEPAI_MAX_PROMPT_CHARS) {
            throw new provider_types_1.AiProviderError(`The prompt is ${prompt.length} characters and DeepAI refuses prompts over ${deepai_pricing_1.DEEPAI_MAX_PROMPT_CHARS}.`, this.name, 'INVALID_REQUEST');
        }
        const edge = this.resolveEdge(request.aspectRatio);
        const form = new FormData();
        form.set('text', prompt);
        form.set('width', String(edge));
        form.set('height', String(edge));
        const payload = (await this.requestJson('POST', `/api/${deepai_pricing_1.DEEPAI_IMAGE_MODEL}`, key, form));
        const url = typeof payload.output_url === 'string' ? payload.output_url : '';
        if (!url) {
            throw new provider_types_1.AiProviderError('DeepAI answered without an output URL. No image was stored.', this.name, 'EMPTY_PROVIDER_RESPONSE');
        }
        const bytes = await this.downloadImage(url);
        return {
            provider: this.name,
            model: deepai_pricing_1.DEEPAI_IMAGE_MODEL,
            images: [
                {
                    mimeType: 'image/jpeg',
                    data: bytes.data,
                    note: `Rendered by deepai (${deepai_pricing_1.DEEPAI_IMAGE_MODEL}) at ${edge}x${edge} from a CDN link, so ISOBASH stored its own copy.`,
                },
            ],
            requested: 1,
        };
    }
    /** A square by default, because `text2img` takes independent width and height. */
    resolveEdge(aspectRatio) {
        if (!aspectRatio)
            return EDGE_BY_RATIO['1:1'];
        const edge = EDGE_BY_RATIO[aspectRatio];
        if (!edge) {
            throw new provider_types_1.AiProviderError(`DeepAI cannot render an aspect ratio of "${aspectRatio}". Mappable values: ${Object.keys(EDGE_BY_RATIO).join(', ')}.`, this.name, 'INVALID_REQUEST');
        }
        if (edge < EDGE_MIN || edge > EDGE_MAX) {
            throw new provider_types_1.AiProviderError(`The edge for "${aspectRatio}" is ${edge}px, outside DeepAI's ${EDGE_MIN}-${EDGE_MAX}px range.`, this.name, 'INVALID_REQUEST');
        }
        return edge;
    }
    async downloadImage(url) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
        let response;
        try {
            response = await fetch(url, {
                signal: controller.signal,
                headers: { accept: 'image/*', 'user-agent': 'isobash/16 (deepai image)' },
            });
        }
        catch (error) {
            throw new provider_types_1.AiProviderError(error instanceof Error && error.name === 'AbortError'
                ? `The generated image did not download within ${DOWNLOAD_TIMEOUT_MS}ms.`
                : `The generated image could not be downloaded: ${error instanceof Error ? error.message : 'unknown error'}.`, this.name, error instanceof Error && error.name === 'AbortError' ? 'PROVIDER_TIMEOUT' : 'PROVIDER_UNAVAILABLE');
        }
        finally {
            clearTimeout(timer);
        }
        if (!response.ok) {
            throw new provider_types_1.AiProviderError(`The generated image link answered HTTP ${response.status}.`, this.name, 'PROVIDER_UNAVAILABLE');
        }
        const declaredLength = Number(response.headers.get('content-length') ?? '');
        if (Number.isFinite(declaredLength) && declaredLength > this.maxDownloadBytes) {
            throw new provider_types_1.AiProviderError(`The generated image announced ${declaredLength} bytes, over the ${this.maxDownloadBytes} byte ceiling.`, this.name, 'PROVIDER_REQUEST_FAILED');
        }
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.byteLength === 0) {
            throw new provider_types_1.AiProviderError('DeepAI produced a zero byte image. Nothing was stored.', this.name, 'EMPTY_PROVIDER_RESPONSE');
        }
        if (bytes.byteLength > this.maxDownloadBytes) {
            throw new provider_types_1.AiProviderError(`The generated image was ${bytes.byteLength} bytes, over the ${this.maxDownloadBytes} byte ceiling.`, this.name, 'PROVIDER_REQUEST_FAILED');
        }
        return { data: bytes.toString('base64') };
    }
    requireKey() {
        const key = this.apiKey;
        if (!key) {
            throw new provider_types_1.AiProviderError('DEEPAI_API_KEY is not configured, so no image can be generated.', this.name, 'PROVIDER_NOT_CONFIGURED');
        }
        return key;
    }
    async requestJson(method, path, key, body) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        let response;
        try {
            response = await fetch(`${this.baseUrl}${path}`, {
                method,
                signal: controller.signal,
                headers: {
                    accept: 'application/json',
                    // DeepAI uses a bare `api-key` header, not `Authorization: Bearer`.
                    'api-key': key,
                    'user-agent': 'isobash/16 (deepai image)',
                    // No content-type: fetch sets the multipart boundary.
                },
                body,
            });
        }
        catch (error) {
            throw new provider_types_1.AiProviderError(error instanceof Error && error.name === 'AbortError'
                ? `DeepAI did not answer ${method} ${path} within ${REQUEST_TIMEOUT_MS}ms.`
                : `DeepAI is unreachable from this server: ${error instanceof Error ? error.message : 'unknown error'}.`, this.name, error instanceof Error && error.name === 'AbortError' ? 'PROVIDER_TIMEOUT' : 'PROVIDER_UNAVAILABLE');
        }
        finally {
            clearTimeout(timer);
        }
        const text = await response.text().catch(() => '');
        if (!response.ok) {
            throw new provider_types_1.AiProviderError(classifyError(response.status, text), this.name, codeFor(response.status, text));
        }
        if (!text)
            return {};
        try {
            return JSON.parse(text);
        }
        catch {
            throw new provider_types_1.AiProviderError('DeepAI returned a body that is not JSON.', this.name, 'EMPTY_PROVIDER_RESPONSE');
        }
    }
};
exports.DeepAiImageProvider = DeepAiImageProvider;
exports.DeepAiImageProvider = DeepAiImageProvider = __decorate([
    (0, common_1.Injectable)()
], DeepAiImageProvider);
function summarize(body) {
    try {
        const parsed = JSON.parse(body);
        const message = parsed?.message ?? parsed?.error;
        if (typeof message === 'string')
            return message.slice(0, 300);
    }
    catch {
        /* fall through to the raw slice */
    }
    return body.slice(0, 300).replace(/\s+/g, ' ');
}
function codeFor(status, body) {
    switch (status) {
        case 400:
            return 'PROVIDER_REQUEST_FAILED';
        case 401:
            return 'INVALID_API_KEY';
        case 402:
            return 'PROVIDER_INSUFFICIENT_CREDITS';
        case 403:
            return 'PROVIDER_SUBSCRIPTION_REQUIRED';
        case 429:
            return 'RATE_LIMITED';
        case 500:
        case 502:
            return 'PROVIDER_UNAVAILABLE';
        case 503:
            return 'PROVIDER_OVERLOADED';
        default:
            return 'PROVIDER_UNAVAILABLE';
    }
}
function classifyError(status, body) {
    const detail = summarize(body);
    switch (status) {
        case 400:
            return `DeepAI rejected the image request. ${detail}`.trim();
        case 401:
            return `DeepAI refused the API key (HTTP 401). ${detail}`.trim();
        case 402:
            return (`DeepAI could not bill this image: the wallet does not cover it, or the account is locked after a failed payment. ${detail} `.trim() +
                `A DeepAI image costs ${exports.DEEPAI_IMAGE_COST_PER_CALL} credit per call.`);
        case 403:
            return (`DeepAI refused this image (HTTP 403): the image APIs require an active paid DeepAI Pro subscription and this ` +
                `account does not have one. ${detail} The API key alone is not enough. No credits were spent.`);
        case 429:
            return `DeepAI is rate limiting this key. ${detail}`.trim();
        case 500:
        case 502:
            return `DeepAI reported a server error (HTTP ${status}). ${detail}`.trim();
        case 503:
            return `DeepAI is temporarily unavailable. ${detail}`.trim();
        default:
            return `DeepAI returned HTTP ${status}. ${detail}`.trim();
    }
}
//# sourceMappingURL=deepai-image.provider.js.map