"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PollinationsProvider = void 0;
const common_1 = require("@nestjs/common");
const provider_types_1 = require("./provider.types");
/**
 * Pollinations: a public, key-less text-to-image endpoint.
 *
 * Why this provider exists at all: the configured Gemini key has a **zero
 * free-tier image quota**, so it can list image models and still never render
 * one. Rather than pretend an image was produced, ISOBASH offers a second real
 * renderer that needs no billing, and the Phase 9 router then has a genuine
 * second candidate to weigh.
 *
 * It is an ordinary HTTP image endpoint: the prompt is path-encoded and the
 * response is the image bytes themselves, not JSON. Nothing here fabricates a
 * result. If the endpoint does not return image bytes, the call fails and the
 * run is failed with the provider's own status.
 */
const DEFAULT_BASE_URL = 'https://image.pollinations.ai';
const DEFAULT_MODEL = 'flux';
/** Hard ceiling so a bad `count` cannot turn one request into an unbounded spend. */
const MAX_IMAGES_PER_CALL = 8;
/** A render that takes longer than this is a failure, not a slow success. */
const RENDER_TIMEOUT_MS = Number(process.env.POLLINATIONS_TIMEOUT_MS || 120000);
/** Refuse an oversized body rather than buffering an unbounded download. */
const MAX_RESPONSE_BYTES = 25 * 1024 * 1024;
/** Pollinations renders at a fixed size per request, so ratios are rounded to it. */
const RENDER_EDGE = 1024;
/** Aspect ratio → the pixel size actually requested from the endpoint. */
function sizeForAspectRatio(aspectRatio) {
    const match = /^(\d{1,2}):(\d{1,2})$/.exec(aspectRatio ?? '');
    if (!match)
        return { width: RENDER_EDGE, height: RENDER_EDGE };
    const ratio = Number(match[1]) / Number(match[2]);
    if (!Number.isFinite(ratio) || ratio <= 0)
        return { width: RENDER_EDGE, height: RENDER_EDGE };
    // Scale the longer edge to the render size and keep the ratio, rounded to 8px
    // so the sniffer reports whole pixels rather than an odd remainder.
    if (ratio >= 1) {
        return { width: RENDER_EDGE, height: Math.max(8, Math.round((RENDER_EDGE / ratio) / 8) * 8) };
    }
    return { width: Math.max(8, Math.round((RENDER_EDGE * ratio) / 8) * 8), height: RENDER_EDGE };
}
function classifyError(status, body) {
    const detail = body.slice(0, 300).replace(/\s+/g, ' ');
    switch (status) {
        case 400:
            return { code: 'PROVIDER_REQUEST_FAILED', detail: `Pollinations rejected the request. ${detail}`.trim() };
        case 401:
        case 403:
            return {
                code: 'INVALID_API_KEY',
                detail: `Pollinations refused the request (HTTP ${status}). A key may now be required on this endpoint. ${detail}`.trim(),
            };
        case 402:
        case 429:
            return {
                code: 'RATE_LIMITED',
                detail: `Pollinations rate limit reached (HTTP ${status}). ${detail}`.trim(),
            };
        case 404:
            return { code: 'MODEL_NOT_AVAILABLE', detail: `Pollinations does not serve this model or endpoint. ${detail}`.trim() };
        case 503:
            return { code: 'PROVIDER_OVERLOADED', detail: `Pollinations is temporarily overloaded (HTTP 503). ${detail}`.trim() };
        default:
            return { code: 'PROVIDER_REQUEST_FAILED', detail: `Pollinations returned HTTP ${status}. ${detail}`.trim() };
    }
}
let PollinationsProvider = class PollinationsProvider {
    name = 'pollinations';
    capabilities = ['image-generation'];
    baseUrl = (process.env.POLLINATIONS_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
    model = process.env.POLLINATIONS_MODEL || DEFAULT_MODEL;
    get apiKey() {
        return process.env.POLLINATIONS_API_KEY || process.env.OPENROUTER_API_IMAGE_VIDEO || undefined;
    }
    /**
     * No key is needed, so there is nothing to be unconfigured about; `health()`
     * reports readiness and the truth about connectivity is established by the first
     * real render, which is exactly how a call-time failure is reported.
     */
    async health() {
        return {
            provider: this.name,
            status: 'healthy',
            capabilities: [...this.capabilities],
            detail: `Key-less public image endpoint (${this.model}); connectivity is confirmed on the first render.`,
        };
    }
    /**
     * This endpoint only renders images. The interface requires `execute`, so the
     * answer is an explicit refusal naming the real capability rather than a method
     * that quietly claims to handle text.
     */
    async execute(request) {
        throw new provider_types_1.AiProviderError(`Pollinations only generates images; it cannot serve ${request.capability}.`, this.name, 'CAPABILITY_UNSUPPORTED');
    }
    async generateImage(request) {
        if (!request.prompt.trim()) {
            throw new provider_types_1.AiProviderError('An image prompt is required.', this.name, 'INVALID_REQUEST');
        }
        const model = request.model || this.model;
        const requested = Math.min(Math.max(request.count ?? 1, 1), MAX_IMAGES_PER_CALL);
        const { width, height } = sizeForAspectRatio(request.aspectRatio);
        // OpenRouter keys are accepted by the Pollinations-compatible endpoint used by
        // this app, so when the project stores the generation key under the
        // OpenRouter variable name we still make it work without a second code path.
        // Typed as a header record rather than inferred from the conditional, so
        // spreading it into `RequestInit.headers` keeps a single object type instead of
        // a union that has no overload to satisfy.
        const authHeaders = this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {};
        const images = [];
        const failures = [];
        let finishReason;
        for (let index = 0; index < requested; index += 1) {
            // A per-image seed so `count: 3` asks for three genuinely different
            // renders rather than three copies of the same one.
            const url = new URL(`${this.baseUrl}/prompt/${encodeURIComponent(request.prompt)}`);
            url.searchParams.set('width', String(width));
            url.searchParams.set('height', String(height));
            url.searchParams.set('nologo', 'true');
            url.searchParams.set('model', model);
            url.searchParams.set('seed', String(Math.floor(Math.random() * 2 ** 31)));
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), RENDER_TIMEOUT_MS);
            let response;
            try {
                response = await fetch(url, {
                    signal: controller.signal,
                    headers: {
                        accept: 'image/*',
                        'user-agent': 'isobash/13 (image generation)',
                        ...authHeaders,
                    },
                });
            }
            catch (error) {
                clearTimeout(timer);
                failures.push({
                    code: 'PROVIDER_UNAVAILABLE',
                    message: error instanceof Error && error.name === 'AbortError'
                        ? `Pollinations did not answer within ${RENDER_TIMEOUT_MS}ms.`
                        : `Pollinations is unreachable from this server: ${error instanceof Error ? error.message : 'unknown error'}.`,
                });
                continue;
            }
            clearTimeout(timer);
            if (!response.ok) {
                const { code, detail } = classifyError(response.status, await response.text().catch(() => ''));
                failures.push({ code, message: detail });
                // A quota wall or a rejected key is an answer, not a blip: spending the
                // remaining images would only hit the same wall.
                if (code !== 'PROVIDER_REQUEST_FAILED' && code !== 'PROVIDER_OVERLOADED')
                    break;
                continue;
            }
            const declared = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '';
            if (declared && !declared.startsWith('image/')) {
                failures.push({
                    code: 'EMPTY_PROVIDER_RESPONSE',
                    message: `Pollinations answered with ${declared || 'an unknown type'} instead of an image.`,
                });
                continue;
            }
            const buffer = Buffer.from(await response.arrayBuffer());
            if (buffer.byteLength === 0) {
                failures.push({ code: 'EMPTY_PROVIDER_RESPONSE', message: 'Pollinations returned an empty body.' });
                continue;
            }
            if (buffer.byteLength > MAX_RESPONSE_BYTES) {
                failures.push({
                    code: 'PROVIDER_REQUEST_FAILED',
                    message: `Pollinations returned ${buffer.byteLength} bytes, over the ${MAX_RESPONSE_BYTES} byte ceiling.`,
                });
                continue;
            }
            // The declared type is the provider's claim, not the truth. The media
            // service sniffs the bytes and stores what they really are, so a wrong
            // header here can never become a wrong `mimeType` on an asset.
            images.push({
                mimeType: declared || 'application/octet-stream',
                data: buffer.toString('base64'),
                note: `Rendered by pollinations (${model}) at ${width}x${height}.`,
            });
        }
        if (images.length === 0 && (0, provider_types_1.isProviderRefusal)(finishReason)) {
            return { provider: this.name, model, images: [], requested, finishReason };
        }
        if (images.length === 0) {
            const first = failures[0];
            throw new provider_types_1.AiProviderError(first?.message ?? 'Pollinations returned no image data.', this.name, first?.code ?? 'EMPTY_PROVIDER_RESPONSE');
        }
        return {
            provider: this.name,
            model,
            images,
            requested,
            ...(failures.length > 0 ? { failures } : {}),
        };
    }
};
exports.PollinationsProvider = PollinationsProvider;
exports.PollinationsProvider = PollinationsProvider = __decorate([
    (0, common_1.Injectable)()
], PollinationsProvider);
//# sourceMappingURL=pollinations.provider.js.map