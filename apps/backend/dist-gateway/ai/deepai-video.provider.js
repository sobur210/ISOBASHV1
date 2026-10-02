"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeepAiVideoProvider = void 0;
const common_1 = require("@nestjs/common");
const provider_types_1 = require("./provider.types");
const deepai_pricing_1 = require("./deepai.pricing");
const DEFAULT_BASE_URL = 'https://api.deepai.org';
const POLL_INTERVAL_MS = Number(process.env.DEEPAI_VIDEO_POLL_INTERVAL_MS || 5_000);
const RENDER_TIMEOUT_MS = Number(process.env.DEEPAI_VIDEO_TIMEOUT_MS || 900_000);
const UPLOAD_TIMEOUT_MS = Number(process.env.DEEPAI_VIDEO_UPLOAD_TIMEOUT_MS || 60_000);
const DOWNLOAD_TIMEOUT_MS = Number(process.env.DEEPAI_VIDEO_DOWNLOAD_TIMEOUT_MS || 120_000);
const MAX_DOWNLOAD_BYTES = Number(process.env.DEEPAI_VIDEO_MAX_BYTES || 200 * 1024 * 1024);
/** Statuses after which DeepAI will not change its mind. */
const TERMINAL = new Set(['complete', 'error', 'canceled']);
/**
 * How long a finished clip stays retrievable.
 *
 * The docs are explicit: the status record and its `output_url` are available for
 * one hour after completion, and after that the status endpoint returns 404. That
 * makes the download step mandatory rather than an optimisation -- a link is never
 * handed to ISOBASH's own users, because there is nothing on our side to serve.
 */
const RESULT_RETENTION_MS = 60 * 60 * 1000;
/** Aspect ratios the shared video surface already offers, mapped onto `shape`. */
const ASPECT_TO_SHAPE = {
    '16:9': 'landscape',
    '9:16': 'vertical',
    '1:1': 'square',
    '4:3': 'standard',
    '3:4': 'portrait',
};
/**
 * DeepAI video generation, on the same job contract as Magic Hour.
 *
 * WHERE THIS STANDS. The adapter is complete and honest about its limits, but it
 * cannot produce a clip from a bare API key: DeepAI video requires an active paid
 * Pro subscription, and a key without one is answered with `403`. See
 * `deepai.pricing.ts` for the full free-tier arithmetic -- 25 standard seconds and
 * 8 Hollywood seconds per month, which is roughly five 5-second clips.
 *
 * The API is the same shape as Magic Hour's, so most of this file is a parallel
 * implementation rather than a different idea: submit a job, get an opaque id back,
 * poll a status endpoint until it reaches a terminal state, then download the
 * result while the link is still alive. What differs:
 *
 *   - Authentication is a bare `api-key` header, not `Authorization: Bearer`.
 *   - Input is `multipart/form-data` (or form-urlencoded, or JSON with a URL), so a
 *     first frame is sent as a file part.
 *   - `403` means "no Pro subscription", which is a configuration problem rather
 *     than a bad key, and gets its own message so nobody goes hunting for a typo.
 *   - A finished result is only retrievable for an hour, which is why the download
 *     is part of `generateVideo` and never a link ISOBASH stores.
 *
 * Nothing here fabricates a clip. A job that does not reach `complete` fails with
 * DeepAI's own reason attached.
 */
let DeepAiVideoProvider = class DeepAiVideoProvider {
    name = 'deepai';
    capabilities = ['video-generation'];
    models = [deepai_pricing_1.DEEPAI_VIDEO_MODEL];
    baseUrl = (process.env.DEEPAI_VIDEO_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
    get apiKey() {
        return process.env.DEEPAI_API_KEY || undefined;
    }
    get defaultModel() {
        return deepai_pricing_1.DEEPAI_VIDEO_MODEL;
    }
    async health() {
        if (!this.apiKey) {
            return {
                provider: this.name,
                status: 'unconfigured',
                capabilities: [...this.capabilities],
                detail: 'DEEPAI_API_KEY is not configured, so no clip can be rendered.',
            };
        }
        return {
            provider: this.name,
            status: 'healthy',
            capabilities: [...this.capabilities],
            detail: `Video generation through DeepAI (${deepai_pricing_1.DEEPAI_VIDEO_QUEUES.hd.label}: ` +
                `${deepai_pricing_1.DEEPAI_VIDEO_QUEUES.hd.freeSecondsPerMonth}s per month shared by every ISOBASH user, then ` +
                `$${deepai_pricing_1.DEEPAI_VIDEO_QUEUES.hd.walletDollarsPerSecond.toFixed(2)}/s from a prepaid wallet; ` +
                `${deepai_pricing_1.DEEPAI_VIDEO_QUEUES.hollywood.label}: ${deepai_pricing_1.DEEPAI_VIDEO_QUEUES.hollywood.freeSecondsPerMonth}s per month, then ` +
                `$${deepai_pricing_1.DEEPAI_VIDEO_QUEUES.hollywood.walletDollarsPerSecond.toFixed(2)}/s). ` +
                `DeepAI video requires an active paid Pro subscription, not just a key, so a key alone will be refused with 403. ` +
                `Whether the allowance can still pay is answered by ProviderCreditService before each render, not here.`,
        };
    }
    /** DeepAI video renders video; `execute` exists only to satisfy the AI interface. */
    async execute(request) {
        throw new provider_types_1.AiProviderError(`DeepAI video only generates video; it cannot serve ${request.capability}.`, this.name, 'CAPABILITY_UNSUPPORTED');
    }
    // ---------------------------------------------------------------- job layer --
    async createJob(params) {
        const key = this.requireKey();
        const prompt = params.prompt.trim();
        const wantsImage = params.image !== undefined;
        if (!wantsImage && !prompt) {
            throw new provider_types_1.AiProviderError('A video prompt is required unless a first frame is supplied.', this.name, 'INVALID_REQUEST');
        }
        if (prompt.length > deepai_pricing_1.DEEPAI_MAX_PROMPT_CHARS) {
            throw new provider_types_1.AiProviderError(`The prompt is ${prompt.length} characters and DeepAI refuses prompts over ${deepai_pricing_1.DEEPAI_MAX_PROMPT_CHARS}.`, this.name, 'INVALID_REQUEST');
        }
        const mode = this.resolveMode(params);
        const seconds = this.resolveDuration(params);
        const shape = this.resolveShape(params, mode, wantsImage);
        /**
         * `multipart/form-data` because a first frame has to go as a file part. The
         * docs also accept a JSON body when the image is a public URL, but ISOBASH's
         * assets are session-authenticated by design, so the bytes are sent here rather
         * than published to a third party.
         */
        const form = new FormData();
        if (prompt)
            form.set('prompt', prompt);
        form.set('mode', mode);
        form.set('duration', String(seconds));
        form.set('shape', shape);
        if (params.image) {
            form.set('image', this.toBlob(params.image), 'first-frame');
        }
        const path = wantsImage ? '/video-api/img2video' : '/video-api/text2video';
        const payload = (await this.requestJson('POST', path, key, form, UPLOAD_TIMEOUT_MS));
        return this.toJob(payload, true, { mode, seconds, shape });
    }
    async getJob(id) {
        const key = this.requireKey();
        const payload = (await this.requestJson('GET', `/video-api/status/${encodeURIComponent(id)}`, key, undefined, 30_000));
        return this.toJob(payload, false, null);
    }
    /**
     * DeepAI publishes no cancel endpoint, so this is deliberately absent.
     *
     * The interface treats the method as optional precisely for this case: inventing
     * a DELETE that does not exist would produce a confident 404 on every call. A
     * cancelled ISOBASH run simply stops waiting, and the job finishes or expires on
     * DeepAI's side -- which the run's note says out loud, because a clip that
     * finishes after ISOBASH gave up is still billed.
     */
    // cancelJob is intentionally not implemented: DeepAI has no cancel endpoint.
    /**
     * DeepAI's documented remaining allowance, in seconds.
     *
     * There is no balance endpoint on the video API, so this reports the allowance
     * ISOBASH has accounted for rather than one DeepAI read back. That is a weaker
     * guarantee than Magic Hour's, and deliberately reported as such: `readable` is
     * true only for the figures the pricing table gives with certainty, and the
     * caller is told the accounting is local in `tier`. Renders started outside
     * ISOBASH, or before a reinstall, are invisible here -- so this number is a
     * display figure, not a guard, and the real protection is the per-pool monthly
     * ceiling still to be built.
     */
    async readCreditBalance() {
        const key = this.apiKey;
        if (!key)
            return { balance: 0, readable: false };
        return {
            balance: deepai_pricing_1.DEEPAI_VIDEO_QUEUES.hd.freeSecondsPerMonth,
            readable: true,
            // `hd` because this is a one-number answer to a two-pool question, and the
            // standard pool is both the larger and the default. The per-mode ledger in
            // ProviderCreditService is what actually guards the Hollywood pool.
            tier: `free-allowance-accounted-locally: ${deepai_pricing_1.DEEPAI_VIDEO_QUEUES.hd.freeSecondsPerMonth}s hd / ${deepai_pricing_1.DEEPAI_VIDEO_QUEUES.hollywood.freeSecondsPerMonth}s hollywood`,
        };
    }
    async downloadResult(job) {
        const url = job.downloads[0]?.url;
        if (!url) {
            throw new provider_types_1.AiProviderError(`DeepAI reported job ${job.id} as ${job.status} but returned no download. No clip was stored.`, this.name, 'EMPTY_PROVIDER_RESPONSE');
        }
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
        let response;
        try {
            response = await fetch(url, {
                signal: controller.signal,
                headers: { accept: 'video/mp4,video/*;q=0.9', 'user-agent': 'isobash/16 (deepai video)' },
            });
        }
        catch (error) {
            throw new provider_types_1.AiProviderError(error instanceof Error && error.name === 'AbortError'
                ? `The finished clip did not download within ${DOWNLOAD_TIMEOUT_MS}ms.`
                : `The finished clip could not be downloaded: ${error instanceof Error ? error.message : 'unknown error'}.`, this.name, error instanceof Error && error.name === 'AbortError' ? 'PROVIDER_TIMEOUT' : 'PROVIDER_UNAVAILABLE');
        }
        finally {
            clearTimeout(timer);
        }
        if (!response.ok) {
            throw new provider_types_1.AiProviderError(`DeepAI's clip link answered HTTP ${response.status}. The link is only valid for an hour after completion, ` +
                `so a clip that is not fetched promptly cannot be recovered.`, this.name, 'PROVIDER_UNAVAILABLE');
        }
        const declaredLength = Number(response.headers.get('content-length') ?? '');
        if (Number.isFinite(declaredLength) && declaredLength > MAX_DOWNLOAD_BYTES) {
            throw new provider_types_1.AiProviderError(`The finished clip announced ${declaredLength} bytes, over the ${MAX_DOWNLOAD_BYTES} byte ceiling.`, this.name, 'PROVIDER_REQUEST_FAILED');
        }
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.byteLength === 0) {
            throw new provider_types_1.AiProviderError('DeepAI produced a zero byte download. Nothing was stored.', this.name, 'EMPTY_PROVIDER_RESPONSE');
        }
        if (bytes.byteLength > MAX_DOWNLOAD_BYTES) {
            throw new provider_types_1.AiProviderError(`The finished clip was ${bytes.byteLength} bytes, over the ${MAX_DOWNLOAD_BYTES} byte ceiling.`, this.name, 'PROVIDER_REQUEST_FAILED');
        }
        // The provider's own claim. The media service sniffs the real container, so a
        // wrong type here cannot become a wrong stored `mimeType`.
        return { mimeType: 'video/mp4', data: bytes.toString('base64') };
    }
    // -------------------------------------------------------- Phase 14 contract --
    async generateVideo(request) {
        const job = await this.createJob({
            prompt: request.prompt,
            ...(request.model ? { model: request.model } : {}),
            ...(request.aspectRatio ? { aspectRatio: request.aspectRatio } : {}),
            ...(request.durationSeconds !== undefined ? { durationSeconds: request.durationSeconds } : {}),
            ...(request.withAudio !== undefined ? { withAudio: request.withAudio } : {}),
            ...(request.image ? { image: request.image } : {}),
        });
        const finished = await this.waitForCompletion(job, request.signal);
        const bytes = await this.downloadResult(finished);
        const video = {
            mimeType: bytes.mimeType,
            data: bytes.data,
            note: [
                `Rendered by deepai (${finished.type ?? deepai_pricing_1.DEEPAI_VIDEO_MODEL})`,
                finished.type ? `in ${finished.type} mode` : null,
                `for ${finished.durationSeconds ?? 'an unknown number of'}s`,
                'from a link that expires an hour after completion, so ISOBASH stored its own copy',
                request.image ? 'from an uploaded first frame' : null,
            ]
                .filter(Boolean)
                .join(' '),
        };
        return {
            provider: this.name,
            model: finished.type ?? deepai_pricing_1.DEEPAI_VIDEO_MODEL,
            video,
            requestedSeconds: finished.durationSeconds ?? request.durationSeconds ?? 0,
            // DeepAI bills per second from the allowance, and the docs say only completed
            // videos are billed, so the charge is derivable rather than reported. It is
            // still marked as an estimate because the authoritative figure is what the
            // provider's own accounting says, and this adapter never queries it.
            metering: {
                providerProjectId: finished.id,
                creditsCharged: finished.durationSeconds,
                creditsChargedIsEstimate: true,
            },
        };
    }
    async waitForCompletion(initial, signal) {
        const deadline = Date.now() + RENDER_TIMEOUT_MS;
        let job = initial;
        let interval = POLL_INTERVAL_MS;
        while (!TERMINAL.has(job.status)) {
            if (Date.now() >= deadline) {
                throw new provider_types_1.AiProviderError(`DeepAI had not finished job ${job.id} after ${RENDER_TIMEOUT_MS}ms (last status ${job.status}). ` +
                    `The job id is kept so its final state can be checked; a client timeout does not mean the render failed, ` +
                    `and a render that finishes later is still billed.`, this.name, 'PROVIDER_TIMEOUT');
            }
            if (signal?.aborted) {
                throw new provider_types_1.AiProviderError(`The render was cancelled while waiting for DeepAI. DeepAI has no cancel endpoint, so the job may still finish and be billed.`, this.name, 'PROVIDER_TIMEOUT');
            }
            await sleep(Math.min(interval, Math.max(0, deadline - Date.now())), signal);
            interval = Math.min(interval * 1.5, 30_000);
            job = await this.getJob(job.id);
        }
        if (job.status === 'error') {
            throw new provider_types_1.AiProviderError(`DeepAI could not render job ${job.id}: ${job.error?.message ?? 'no reason given'}` +
                `${job.error?.code ? ` (${job.error.code})` : ''}.`, this.name, job.error?.code === 'NSFW detected' ? 'PROHIBITED_CONTENT' : 'PROVIDER_REQUEST_FAILED');
        }
        return job;
    }
    // ------------------------------------------------------------- resolution ---
    /**
     * Hollywood Mode when audio is asked for, standard otherwise.
     *
     * DeepAI has no separate audio switch: audio arrives with Hollywood Mode, so a
     * request for audio and a request for 2K are the same request. A caller that
     * pinned a mode and also asked for audio gets the pinned mode, and is told that
     * audio is only carried by Hollywood rather than being silently upgraded -- a
     * silent upgrade would spend the 8-second pool on a 25-second one.
     */
    resolveMode(params) {
        const requested = params.model?.split(':').slice(1).join(':');
        if ((0, deepai_pricing_1.isDeepAiVideoMode)(requested)) {
            if (params.withAudio === true && requested !== 'hollywood') {
                throw new provider_types_1.AiProviderError(`DeepAI model "${requested}" does not carry audio. Audio is only available in hollywood mode, ` +
                    `which has its own ${deepai_pricing_1.DEEPAI_VIDEO_QUEUES.hollywood.freeSecondsPerMonth}s monthly allowance.`, this.name, 'MODEL_NOT_AVAILABLE');
            }
            return requested;
        }
        return params.withAudio === true ? 'hollywood' : 'hd';
    }
    /**
     * Refuse a length DeepAI cannot render rather than snapping to a neighbour.
     *
     * `MediaService` validates against `MEDIA_VIDEO_DURATIONS`, which is a
     * deployment-wide list shared with providers that accept 4 seconds. Clamping
     * here would answer a 4-second request with a 5-second clip that the user paid
     * for a second they did not ask to spend.
     */
    resolveDuration(params) {
        const requested = params.durationSeconds;
        if (requested === undefined)
            return (0, deepai_pricing_1.clampDeepAiSeconds)(5);
        const whole = Math.floor(requested);
        if (whole !== requested) {
            throw new provider_types_1.AiProviderError(`DeepAI renders whole seconds only, and ${requested} is not a whole number.`, this.name, 'INVALID_REQUEST');
        }
        if (whole < deepai_pricing_1.DEEPAI_VIDEO_MIN_SECONDS || whole > deepai_pricing_1.DEEPAI_VIDEO_MAX_SECONDS) {
            throw new provider_types_1.AiProviderError(`DeepAI renders clips of ${deepai_pricing_1.DEEPAI_VIDEO_MIN_SECONDS}-${deepai_pricing_1.DEEPAI_VIDEO_MAX_SECONDS} seconds, and ${whole}s was requested. ` +
                `Nothing was submitted.`, this.name, 'INVALID_REQUEST');
        }
        return whole;
    }
    /**
     * Map the shared aspect ratios onto DeepAI's `shape`, or use `auto`.
     *
     * The docs require `auto` for Hollywood image-to-video, because in that mode
     * DeepAI always keeps the source image's shape and rejects an explicit one.
     */
    resolveShape(params, mode, wantsImage) {
        if (mode === 'hollywood' && wantsImage)
            return 'auto';
        if (!params.aspectRatio)
            return 'auto';
        const shape = ASPECT_TO_SHAPE[params.aspectRatio];
        if (!shape) {
            throw new provider_types_1.AiProviderError(`DeepAI cannot render an aspect ratio of "${params.aspectRatio}". Mappable values: ` +
                `${Object.keys(ASPECT_TO_SHAPE).join(', ')}, or auto.`, this.name, 'INVALID_REQUEST');
        }
        return shape;
    }
    // ------------------------------------------------------------- plumbing ----
    requireKey() {
        const key = this.apiKey;
        if (!key) {
            throw new provider_types_1.AiProviderError('DEEPAI_API_KEY is not configured, so no clip can be rendered.', this.name, 'PROVIDER_NOT_CONFIGURED');
        }
        return key;
    }
    toBlob(image) {
        const mimeType = image.mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
        if (!mimeType.startsWith('image/')) {
            throw new provider_types_1.AiProviderError(`DeepAI cannot accept a first frame of type "${image.mimeType}". It must be an image.`, this.name, 'INVALID_REQUEST');
        }
        const bytes = Buffer.from(image.data, 'base64');
        if (bytes.byteLength === 0) {
            throw new provider_types_1.AiProviderError('The first-frame image is empty.', this.name, 'INVALID_REQUEST');
        }
        if (bytes.byteLength > deepai_pricing_1.DEEPAI_MAX_SOURCE_IMAGE_BYTES) {
            throw new provider_types_1.AiProviderError(`The first-frame image is ${bytes.byteLength} bytes, over DeepAI's ${deepai_pricing_1.DEEPAI_MAX_SOURCE_IMAGE_BYTES} byte ceiling.`, this.name, 'INVALID_REQUEST');
        }
        return new Blob([new Uint8Array(bytes)], { type: mimeType });
    }
    /**
     * Map DeepAI's `{ id, status }` and `{ status, output_url, error }` onto one job.
     *
     * DeepAI reports `processing` while it works and `completed` / `failed` at the
     * end, so `processing` becomes `rendering` and the two terminal states become
     * `complete` and `error`. The create response carries no status at all, so it is
     * recorded as `unknown` rather than inventing a `queued` DeepAI never said.
     */
    toJob(payload, isCreate, context) {
        const id = typeof payload.id === 'string' && payload.id ? payload.id : '';
        if (!id) {
            throw new provider_types_1.AiProviderError('DeepAI returned a response with no job id.', this.name, 'EMPTY_PROVIDER_RESPONSE');
        }
        const status = isCreate ? 'unknown' : normaliseStatus(payload.status);
        const outputUrl = typeof payload.output_url === 'string' ? payload.output_url : '';
        const downloads = outputUrl
            ? [{ url: outputUrl, expiresAt: new Date(Date.now() + RESULT_RETENTION_MS).toISOString() }]
            : [];
        const errorText = typeof payload.error === 'string' ? payload.error : '';
        return {
            id,
            status,
            // DeepAI never quotes a credit figure on the video API. The seconds are
            // reported in the slot credits use, and flagged as an estimate everywhere it
            // is read, because a render IS metered but ISOBASH is deriving the number.
            creditsCharged: context ? context.seconds : null,
            creditsChargedIsEstimate: true,
            width: numberOrNull(payload.width),
            height: numberOrNull(payload.height),
            durationSeconds: context ? context.seconds : null,
            // DeepAI's video API reports no progress field, so the run is honest about
            // having none rather than interpolating a percentage that is not its own.
            progressPercent: null,
            error: errorText ? { code: errorText, message: errorText } : null,
            downloads,
            // `mode` stands in for the "type" field, so the stored clip says which of the
            // two separate monthly pools paid for it.
            type: context ? context.mode : null,
        };
    }
    async requestJson(method, path, key, body, timeoutMs) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        let response;
        try {
            response = await fetch(`${this.baseUrl}${path}`, {
                method,
                signal: controller.signal,
                headers: {
                    accept: 'application/json',
                    // A bare `api-key` header, which is what DeepAI documents. Not Bearer.
                    'api-key': key,
                    'user-agent': 'isobash/16 (deepai video)',
                    // Deliberately no content-type: fetch sets the multipart boundary itself.
                },
                ...(body === undefined ? {} : { body }),
            });
        }
        catch (error) {
            throw new provider_types_1.AiProviderError(error instanceof Error && error.name === 'AbortError'
                ? `DeepAI did not answer ${method} ${path} within ${timeoutMs}ms.`
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
exports.DeepAiVideoProvider = DeepAiVideoProvider;
exports.DeepAiVideoProvider = DeepAiVideoProvider = __decorate([
    (0, common_1.Injectable)()
], DeepAiVideoProvider);
function normaliseStatus(value) {
    switch (value) {
        case 'processing':
            return 'rendering';
        case 'completed':
            return 'complete';
        case 'failed':
            return 'error';
        case 'pending':
        case 'queued':
            return 'queued';
        default:
            return 'unknown';
    }
}
function numberOrNull(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
function sleep(ms, signal) {
    return new Promise((resolve) => {
        const timer = setTimeout(finish, ms);
        signal?.addEventListener('abort', finish, { once: true });
        function finish() {
            clearTimeout(timer);
            signal?.removeEventListener('abort', finish);
            resolve();
        }
    });
}
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
/**
 * DeepAI's own codes, then status codes.
 *
 * `403` is separated from `401` on purpose: `401` is a bad or missing key, and
 * `403` is a good key on an account without a Pro subscription. Telling someone
 * to re-check their API key when the real problem is a missing subscription sends
 * them to the wrong place entirely.
 */
function codeFor(status, body) {
    if (status === 402)
        return 'PROVIDER_INSUFFICIENT_CREDITS';
    switch (status) {
        case 400:
            return 'PROVIDER_REQUEST_FAILED';
        case 401:
            return 'INVALID_API_KEY';
        case 403:
            return 'PROVIDER_SUBSCRIPTION_REQUIRED';
        case 404:
            return 'MODEL_NOT_AVAILABLE';
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
            return `DeepAI rejected the request. ${detail}`.trim();
        case 401:
            return `DeepAI refused the API key (HTTP 401). The key is missing, wrong, or was issued for a different account. ${detail}`.trim();
        case 402:
            return (`DeepAI could not bill this render: the wallet balance does not cover it, or the account is locked after a failed payment. ${detail} `.trim() +
                `Standard video costs $${deepai_pricing_1.DEEPAI_VIDEO_QUEUES.hd.walletDollarsPerSecond.toFixed(2)}/s and Hollywood ` +
                `$${deepai_pricing_1.DEEPAI_VIDEO_QUEUES.hollywood.walletDollarsPerSecond.toFixed(2)}/s once the monthly allowance is used up.`);
        case 403:
            return (`DeepAI refused this render (HTTP 403): the video generator requires an active paid DeepAI Pro subscription, ` +
                `and this account does not have one. ${detail} `.trim() +
                `The API key alone is not enough for video. No credits were spent.`);
        case 404:
            return `DeepAI does not know this model or job. ${detail}`.trim();
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
//# sourceMappingURL=deepai-video.provider.js.map