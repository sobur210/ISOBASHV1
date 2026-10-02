"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MagicHourVideoProvider = void 0;
const common_1 = require("@nestjs/common");
const provider_types_1 = require("./provider.types");
const magic_hour_pricing_1 = require("./magic-hour.pricing");
const DEFAULT_BASE_URL = 'https://api.magichour.ai';
/**
 * Poll cadence. The docs describe checking "every 3-10 seconds" and warn that
 * processing times are not an SLA, so this sits mid-range and backs off towards
 * the top of that window the longer a job takes.
 */
const POLL_INTERVAL_MS = Number(process.env.MAGICHOUR_VIDEO_POLL_INTERVAL_MS || 5_000);
const POLL_MAX_INTERVAL_MS = 10_000;
/** A render that has not answered in this long is treated as failed, not left holding a slot. */
const RENDER_TIMEOUT_MS = Number(process.env.MAGICHOUR_VIDEO_TIMEOUT_MS || 600_000);
const UPLOAD_TIMEOUT_MS = Number(process.env.MAGICHOUR_VIDEO_UPLOAD_TIMEOUT_MS || 60_000);
const DOWNLOAD_TIMEOUT_MS = Number(process.env.MAGICHOUR_VIDEO_DOWNLOAD_TIMEOUT_MS || 120_000);
/** Refuse an oversized download rather than buffering an unbounded clip in memory. */
const MAX_DOWNLOAD_BYTES = Number(process.env.MAGICHOUR_VIDEO_MAX_BYTES || 200 * 1024 * 1024);
const MAX_SOURCE_IMAGE_BYTES = 10 * 1024 * 1024;
/** Statuses after which Magic Hour will not change its mind. */
const TERMINAL = new Set(['complete', 'error', 'canceled']);
/** Magic Hour accepts these image extensions for an upload; the dot is not sent. */
const IMAGE_EXTENSIONS = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/avif': 'avif',
    'image/heic': 'heic',
    'image/heif': 'heif',
    'image/tiff': 'tiff',
    'image/bmp': 'bmp',
};
/**
 * Magic Hour video generation, as the first `VideoProvider` on the shared job
 * contract in `video-provider.types.ts`.
 *
 * MAGIC HOUR FREE TIER. This adapter is wired to a free account: one shared pool of
 * 400 credits per month across every ISOBASH user, output capped at 480p, and the
 * clip is watermarked by the provider. It is for building and testing the
 * integration, not for production output quality. The places that would change for
 * a paid provider are called out below; the interface itself does not change, so
 * adding Veo, Luma or a paid Magic Hour plan is a new file plus a registration line.
 *
 * Where the free tier is baked in, and how to lift it:
 *   - `MAGICHOUR_RESOLUTION` (default `480p`) and `MAGICHOUR_ALLOWED_MODELS` (default
 *     the two models the free plan can use). Raising both is all a paid plan needs.
 *   - `ProviderCreditService` is the shared-pool guard. It exists because this one
 *     account pays for every user; a paid plan with its own per-tenant billing would
 *     keep the service but stop consulting it, because there is no longer one pool.
 *
 * Nothing here fabricates a clip. If the project does not reach `complete`, or
 * `downloads` is empty, the call fails and the run records the provider's own
 * status and error verbatim.
 */
let MagicHourVideoProvider = class MagicHourVideoProvider {
    name = 'magic-hour';
    capabilities = ['video-generation'];
    models = magic_hour_pricing_1.MAGIC_HOUR_MODELS;
    baseUrl = (process.env.MAGICHOUR_VIDEO_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
    resolution = process.env.MAGICHOUR_VIDEO_RESOLUTION || magic_hour_pricing_1.MAGIC_HOUR_FREE_MAX_RESOLUTION;
    allowedModels = new Set((process.env.MAGICHOUR_VIDEO_ALLOWED_MODELS || magic_hour_pricing_1.MAGIC_HOUR_FREE_MODELS.join(','))
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean));
    get apiKey() {
        return process.env.MAGICHOUR_API_KEY || undefined;
    }
    /** The model actually used when the caller does not pin one. */
    get defaultModel() {
        const first = [...this.allowedModels][0];
        return first || magic_hour_pricing_1.MAGIC_HOUR_FREE_MODELS[0];
    }
    /**
     * Models this deployment will actually accept. The module registers exactly
     * these, so `/ai/capabilities` can never offer a model that `createJob` then
     * refuses -- the two are derived from the same list on purpose.
     */
    get enabledModels() {
        return [...this.allowedModels];
    }
    async health() {
        if (!this.apiKey) {
            return {
                provider: this.name,
                status: 'unconfigured',
                capabilities: [...this.capabilities],
                detail: 'MAGICHOUR_API_KEY is not configured, so no clip can be rendered.',
            };
        }
        const models = [...this.allowedModels].join(', ');
        return {
            provider: this.name,
            status: 'healthy',
            capabilities: [...this.capabilities],
            detail: `Video generation through Magic Hour at ${this.resolution} (free tier: watermarked output, one credit pool ` +
                `shared by every ISOBASH user rather than a per-user allowance). Models: ${models}. ` +
                `Whether the pool can still pay is answered by ProviderCreditService before each render, not here.`,
        };
    }
    /** Magic Hour renders video; `execute` exists only to satisfy the AI interface. */
    async execute(request) {
        throw new provider_types_1.AiProviderError(`Magic Hour only generates video; it cannot serve ${request.capability}.`, this.name, 'CAPABILITY_UNSUPPORTED');
    }
    // ---------------------------------------------------------------- job layer --
    async createJob(params) {
        const key = this.requireKey();
        const prompt = params.prompt.trim();
        if (!prompt) {
            throw new provider_types_1.AiProviderError('A video prompt is required.', this.name, 'INVALID_REQUEST');
        }
        const model = this.resolveModel(params.model);
        const seconds = params.durationSeconds ?? 4;
        const body = {
            end_seconds: seconds,
            model,
            resolution: this.resolution,
            audio: params.withAudio === true,
            // Names the project in the Magic Hour dashboard, which is where an operator
            // looks when reconciling the shared pool against this month's usage.
            name: `isobash-${Date.now()}`,
        };
        if (params.aspectRatio)
            body.aspect_ratio = params.aspectRatio;
        /**
         * Image-to-video goes to its own endpoint and needs the first frame at a
         * `file_path` in Magic Hour's storage, obtained by asking for a presigned URL
         * and PUTting the bytes to it. The bytes come from ISOBASH's own session
         * authenticated asset route, so they are uploaded here rather than linked: the
         * frame does become retrievable by URL on Magic Hour's side until that upload
         * expires, which is disclosed in the run's note.
         */
        if (params.image) {
            const filePath = await this.uploadFirstFrame(params.image, key);
            body.assets = { image_file_path: filePath };
        }
        // `style.prompt` is required by /v1/text-to-video and optional on
        // /v1/image-to-video, where the image carries most of the meaning.
        body.style = { prompt };
        const path = params.image ? '/v1/image-to-video' : '/v1/text-to-video';
        const payload = await this.requestJson('POST', path, key, body, RENDER_TIMEOUT_MS);
        return this.toJob(payload, true);
    }
    async getJob(id) {
        const key = this.requireKey();
        const payload = await this.requestJson('GET', `/v1/video-projects/${encodeURIComponent(id)}`, key, undefined, 30_000);
        return this.toJob(payload, false);
    }
    async cancelJob(id) {
        const key = this.requireKey();
        // Best effort. A project that has already started may not be cancellable, and
        // the poll loop notices `canceled` on its own, so a failure here is not fatal.
        await this.requestJson('DELETE', `/v1/video-projects/${encodeURIComponent(id)}`, key, undefined, 30_000);
    }
    /**
     * Read the account's real balance.
     *
     * `/v1/account` is free -- it renders nothing -- so this is the one call worth
     * making before every submission: it is the only number that accounts for renders
     * started outside ISOBASH, which the local ledger structurally cannot see.
     *
     * A failure is reported as `readable: false` rather than thrown. Throwing would
     * mean a network blip looked identical to "the pool is fine", and the caller's
     * only correct response to an unknown balance is to stop.
     */
    async readCreditBalance() {
        const key = this.apiKey;
        if (!key)
            return { balance: 0, readable: false };
        try {
            const payload = (await this.requestJson('GET', '/v1/account', key, undefined, 15_000));
            const credits = payload?.credits;
            if (typeof credits !== 'number' || !Number.isFinite(credits)) {
                // The endpoint answered but without a balance. Guessing here would be the one
                // way to overspend a pool that is meant to be protected.
                return { balance: 0, readable: false, ...(typeof payload?.tier === 'string' ? { tier: payload.tier } : {}) };
            }
            return {
                balance: credits,
                readable: true,
                ...(typeof payload?.tier === 'string' ? { tier: payload.tier } : {}),
            };
        }
        catch {
            return { balance: 0, readable: false };
        }
    }
    async downloadResult(job) {
        const first = job.downloads[0];
        if (!first) {
            throw new provider_types_1.AiProviderError(`Magic Hour reported ${job.id} as ${job.status} but returned no download. No clip was stored.`, this.name, 'EMPTY_PROVIDER_RESPONSE');
        }
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
        let response;
        try {
            response = await fetch(first.url, {
                signal: controller.signal,
                headers: { accept: 'video/mp4,video/*;q=0.9', 'user-agent': 'isobash/15 (magic hour video)' },
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
            throw new provider_types_1.AiProviderError(`Magic Hour's download link answered HTTP ${response.status}. The link is temporary, so a clip that is not fetched promptly cannot be recovered.`, this.name, 'PROVIDER_UNAVAILABLE');
        }
        const declaredLength = Number(response.headers.get('content-length') ?? '');
        if (Number.isFinite(declaredLength) && declaredLength > MAX_DOWNLOAD_BYTES) {
            throw new provider_types_1.AiProviderError(`The finished clip announced ${declaredLength} bytes, over the ${MAX_DOWNLOAD_BYTES} byte ceiling.`, this.name, 'PROVIDER_REQUEST_FAILED');
        }
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.byteLength === 0) {
            throw new provider_types_1.AiProviderError('Magic Hour produced a zero byte download. Nothing was stored.', this.name, 'EMPTY_PROVIDER_RESPONSE');
        }
        if (bytes.byteLength > MAX_DOWNLOAD_BYTES) {
            throw new provider_types_1.AiProviderError(`The finished clip was ${bytes.byteLength} bytes, over the ${MAX_DOWNLOAD_BYTES} byte ceiling.`, this.name, 'PROVIDER_REQUEST_FAILED');
        }
        // The provider's claim only. The media service sniffs the real container, so a
        // wrong type here can never become a wrong stored `mimeType`.
        return { mimeType: 'video/mp4', data: bytes.toString('base64') };
    }
    // -------------------------------------------------------- Phase 14 contract --
    async generateVideo(request) {
        // A queued job that is retried after its worker died resumes the project it
        // already paid to create. Submitting a second one would render the same clip
        // twice and charge the shared pool twice for it, and the provider has no way to
        // recognise the duplicate.
        const resuming = Boolean(request.providerJobId);
        const job = request.providerJobId
            ? await this.getJob(request.providerJobId)
            : await this.createJob({
                prompt: request.prompt,
                ...(request.model ? { model: request.model } : {}),
                ...(request.aspectRatio ? { aspectRatio: request.aspectRatio } : {}),
                ...(request.durationSeconds !== undefined ? { durationSeconds: request.durationSeconds } : {}),
                ...(request.withAudio !== undefined ? { withAudio: request.withAudio } : {}),
                ...(request.image ? { image: request.image } : {}),
            });
        const finished = await this.waitForCompletion(job, request.signal, request.onJobProgress);
        const bytes = await this.downloadResult(finished);
        const actual = finished.creditsCharged;
        const video = {
            mimeType: bytes.mimeType,
            data: bytes.data,
            note: [
                `Rendered by magic-hour (${this.resolveModel(request.model)})`,
                request.aspectRatio ? `at ${request.aspectRatio}` : null,
                `at ${this.resolution}`,
                `for ${request.durationSeconds ?? 4}s`,
                actual === null ? null : `costing ${actual} credit(s) of the shared monthly pool`,
                finished.downloads[0]?.expiresAt ? 'from a provider link that expires, so ISOBASH stored its own copy' : null,
                request.image ? 'from an uploaded first frame (retrievable by URL on the provider until it expires)' : null,
            ]
                .filter(Boolean)
                .join(' '),
        };
        return {
            provider: this.name,
            model: this.resolveModel(request.model),
            video,
            requestedSeconds: request.durationSeconds ?? 4,
            // The provider's own figures, so the caller settles against what Magic Hour
            // charged rather than against ISOBASH's estimate. A completed job's figure is
            // final; a terminal failure is refunded, which is why it can read lower than
            // the estimate taken before submission.
            metering: {
                providerProjectId: finished.id,
                creditsCharged: actual,
                creditsChargedIsEstimate: finished.creditsChargedIsEstimate,
            },
        };
    }
    /**
     * Poll until the project reaches a terminal status.
     *
     * Polling, not webhooks, is the primary path here. Magic Hour's webhooks need a
     * publicly reachable URL, which a local install does not have, and a `canceled`
     * project emits no webhook at all (the docs say so), so a webhook-only
     * implementation would silently hang on cancellation. The job primitives above
     * are what a webhook handler would drive instead, so adding one later does not
     * change this loop's shape.
     */
    async waitForCompletion(initial, signal, onProgress) {
        const deadline = Date.now() + RENDER_TIMEOUT_MS;
        let job = initial;
        let interval = POLL_INTERVAL_MS;
        this.report(onProgress, job);
        while (!TERMINAL.has(job.status)) {
            if (Date.now() >= deadline) {
                throw new provider_types_1.AiProviderError(`Magic Hour had not finished project ${job.id} after ${RENDER_TIMEOUT_MS}ms (last status ${job.status}). ` +
                    `The project id is kept so its final state can be checked; a client timeout does not mean the render failed.`, this.name, 'PROVIDER_TIMEOUT', 
                // Deliberately keeps the reservation alive downstream: this render is still
                // running on the provider's side and may yet be charged.
                { providerProjectId: job.id, creditsCharged: job.creditsCharged, timedOut: true });
            }
            if (signal?.aborted) {
                throw new provider_types_1.AiProviderError('The render was cancelled while waiting for Magic Hour.', this.name, 'PROVIDER_TIMEOUT', { providerProjectId: job.id, cancelled: true });
            }
            await sleep(Math.min(interval, Math.max(0, deadline - Date.now())), signal);
            // Back off towards the top of the documented window so a long render is not
            // polled as hard as a short one.
            interval = Math.min(interval * 1.5, POLL_MAX_INTERVAL_MS);
            job = await this.getJob(job.id);
            this.report(onProgress, job);
        }
        if (job.status === 'error') {
            throw new provider_types_1.AiProviderError(`Magic Hour could not render project ${job.id}: ${job.error?.message ?? 'no reason given'}` +
                `${job.error?.code ? ` (${job.error.code})` : ''}.`, this.name, 'PROVIDER_REQUEST_FAILED', 
            // The project really was created, so this failure may have cost credits.
            { providerProjectId: job.id, creditsCharged: job.creditsCharged });
        }
        if (job.status === 'canceled') {
            throw new provider_types_1.AiProviderError(`Magic Hour project ${job.id} was canceled.`, this.name, 'PROVIDER_REQUEST_FAILED', { providerProjectId: job.id, creditsCharged: job.creditsCharged });
        }
        return job;
    }
    /**
     * Hand the provider's own view of the render to the caller.
     *
     * A failure to report must not fail the render: the caller is being told about a
     * job that already exists and is already paid for, so turning a reporting problem
     * into a failed render would waste credits that have been committed.
     */
    report(onProgress, job) {
        if (!onProgress)
            return;
        try {
            onProgress({ id: job.id, status: job.status, progressPercent: job.progressPercent ?? null });
        }
        catch {
            // Deliberately swallowed; see above.
        }
    }
    // ------------------------------------------------------------- plumbing ----
    requireKey() {
        const key = this.apiKey;
        if (!key) {
            throw new provider_types_1.AiProviderError('MAGICHOUR_API_KEY is not configured, so no clip can be rendered.', this.name, 'PROVIDER_NOT_CONFIGURED');
        }
        return key;
    }
    resolveModel(requested) {
        const model = requested || this.defaultModel;
        if (!(0, magic_hour_pricing_1.isMagicHourModel)(model)) {
            throw new provider_types_1.AiProviderError(`Magic Hour does not offer a video model called "${model}".`, this.name, 'MODEL_NOT_AVAILABLE');
        }
        if (!this.allowedModels.has(model)) {
            throw new provider_types_1.AiProviderError(`Magic Hour model "${model}" is not enabled on this deployment. Enabled: ${[...this.allowedModels].join(', ')}. ` +
                `On the free plan only ${magic_hour_pricing_1.MAGIC_HOUR_FREE_MODELS.join(' and ')} are available.`, this.name, 'MODEL_NOT_AVAILABLE');
        }
        return model;
    }
    async uploadFirstFrame(image, key) {
        const extension = IMAGE_EXTENSIONS[image.mimeType.split(';')[0]?.trim().toLowerCase() ?? ''];
        if (!extension) {
            throw new provider_types_1.AiProviderError(`Magic Hour cannot accept a first frame of type "${image.mimeType}". Accepted: ${[...new Set(Object.values(IMAGE_EXTENSIONS))].join(', ')}.`, this.name, 'INVALID_REQUEST');
        }
        const bytes = Buffer.from(image.data, 'base64');
        if (bytes.byteLength === 0) {
            throw new provider_types_1.AiProviderError('The first-frame image is empty.', this.name, 'INVALID_REQUEST');
        }
        if (bytes.byteLength > MAX_SOURCE_IMAGE_BYTES) {
            throw new provider_types_1.AiProviderError(`The first-frame image is ${bytes.byteLength} bytes, over the ${MAX_SOURCE_IMAGE_BYTES} byte ceiling.`, this.name, 'INVALID_REQUEST');
        }
        const granted = (await this.requestJson('POST', '/v1/files/upload-urls', key, { items: [{ type: 'image', extension }] }, UPLOAD_TIMEOUT_MS));
        const item = granted?.items?.[0];
        const uploadUrl = typeof item?.upload_url === 'string' ? item.upload_url : '';
        const filePath = typeof item?.file_path === 'string' ? item.file_path : '';
        if (!uploadUrl || !filePath) {
            throw new provider_types_1.AiProviderError('Magic Hour granted no usable upload slot for the first frame.', this.name, 'EMPTY_PROVIDER_RESPONSE');
        }
        /**
         * PUT the raw bytes. No content-type is sent, because the documented example
         * does not send one and the presigned signature was computed without it.
         */
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
        let response;
        try {
            response = await fetch(uploadUrl, {
                method: 'PUT',
                signal: controller.signal,
                headers: { 'user-agent': 'isobash/15 (magic hour video)' },
                body: bytes,
            });
        }
        catch (error) {
            throw new provider_types_1.AiProviderError(`The first frame could not be uploaded to Magic Hour: ${error instanceof Error ? error.message : 'unknown error'}.`, this.name, error instanceof Error && error.name === 'AbortError' ? 'PROVIDER_TIMEOUT' : 'PROVIDER_UNAVAILABLE');
        }
        finally {
            clearTimeout(timer);
        }
        if (!response.ok) {
            throw new provider_types_1.AiProviderError(`Magic Hour refused the first frame upload (HTTP ${response.status}).`, this.name, 'PROVIDER_REQUEST_FAILED');
        }
        return filePath;
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
                    authorization: `Bearer ${key}`,
                    'user-agent': 'isobash/15 (magic hour video)',
                    ...(body === undefined ? {} : { 'content-type': 'application/json' }),
                },
                ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            });
        }
        catch (error) {
            throw new provider_types_1.AiProviderError(error instanceof Error && error.name === 'AbortError'
                ? `Magic Hour did not answer ${method} ${path} within ${timeoutMs}ms.`
                : `Magic Hour is unreachable from this server: ${error instanceof Error ? error.message : 'unknown error'}.`, this.name, error instanceof Error && error.name === 'AbortError' ? 'PROVIDER_TIMEOUT' : 'PROVIDER_UNAVAILABLE');
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
            throw new provider_types_1.AiProviderError('Magic Hour returned a body that is not JSON.', this.name, 'EMPTY_PROVIDER_RESPONSE');
        }
    }
    /**
     * Normalise both shapes onto one `VideoJob`.
     *
     * The create response is only `{ id, credits_charged }`, so it is mapped with
     * `isCreate` and the status is left `unknown` rather than inventing a `queued`
     * the provider never said. The details response carries the real status, the
     * dimensions, the error and the downloads.
     */
    toJob(payload, isCreate) {
        const id = typeof payload.id === 'string' ? payload.id : '';
        if (!id) {
            throw new provider_types_1.AiProviderError('Magic Hour returned a response with no project id.', this.name, 'EMPTY_PROVIDER_RESPONSE');
        }
        const charged = numberOrNull(payload.credits_charged);
        const errorObject = (payload.error ?? null);
        const downloads = Array.isArray(payload.downloads)
            ? payload.downloads
                .map((entry) => {
                const item = entry;
                return {
                    url: typeof item.url === 'string' ? item.url : '',
                    expiresAt: typeof item.expires_at === 'string' ? item.expires_at : null,
                };
            })
                .filter((entry) => entry.url)
            : [];
        return {
            id,
            status: isCreate ? 'unknown' : normaliseStatus(payload.status),
            creditsCharged: charged,
            // A create-time figure is explicitly an estimate; the details figure is the
            // final one for a completed job.
            creditsChargedIsEstimate: isCreate || normaliseStatus(payload.status) !== 'complete',
            width: numberOrNull(payload.width),
            height: numberOrNull(payload.height),
            durationSeconds: numberOrNull(payload.end_seconds),
            progressPercent: progressPercent(payload.progress),
            error: errorObject && typeof errorObject === 'object' && typeof errorObject.message === 'string'
                ? { code: String(errorObject.code ?? 'unknown'), message: errorObject.message }
                : null,
            downloads,
            type: typeof payload.type === 'string' ? payload.type : null,
        };
    }
};
exports.MagicHourVideoProvider = MagicHourVideoProvider;
exports.MagicHourVideoProvider = MagicHourVideoProvider = __decorate([
    (0, common_1.Injectable)()
], MagicHourVideoProvider);
const STATUSES = ['draft', 'queued', 'rendering', 'complete', 'error', 'canceled'];
function normaliseStatus(value) {
    const text = typeof value === 'string' ? value : '';
    return STATUSES.includes(text) ? text : 'unknown';
}
function numberOrNull(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
/**
 * Read a reported progress figure, in 0-1 or 0-100.
 *
 * Providers disagree about the scale, and a fraction sent where a percentage is
 * expected would show 0.4% for a render that is nearly done. Anything outside
 * either scale, or not finite, is treated as "this provider reported no progress" so
 * the UI shows a spinner rather than a wrong number.
 */
function progressPercent(value) {
    const number = numberOrNull(value);
    if (number === null)
        return null;
    if (number > 0 && number <= 1)
        return Math.round(number * 100);
    if (number > 1 && number <= 100)
        return Math.round(number);
    return null;
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
/** Magic Hour returns `{ code, message }` for every error, so the body decides the code. */
function parseErrorCode(body) {
    try {
        const parsed = JSON.parse(body);
        const code = typeof parsed?.code === 'string' ? parsed.code : parsed?.error?.code;
        return typeof code === 'string' ? code : null;
    }
    catch {
        return null;
    }
}
function summarize(body) {
    try {
        const parsed = JSON.parse(body);
        if (typeof parsed?.message === 'string')
            return parsed.message.slice(0, 300);
    }
    catch {
        /* fall through to the raw slice */
    }
    return body.slice(0, 300).replace(/\s+/g, ' ');
}
function codeFor(status, body) {
    if (status === 402) {
        // The shared pool is empty. Distinct from a rate limit on purpose: failing
        // over to another provider would spend credits the account does not have.
        return 'PROVIDER_INSUFFICIENT_CREDITS';
    }
    switch (status) {
        case 400:
            return 'PROVIDER_REQUEST_FAILED';
        case 401:
        case 403:
            return 'INVALID_API_KEY';
        case 404:
            return 'MODEL_NOT_AVAILABLE';
        case 422:
            return 'PROVIDER_REQUEST_FAILED';
        case 429:
            return 'RATE_LIMITED';
        case 500:
            return 'PROVIDER_UNAVAILABLE';
        case 503:
            return 'PROVIDER_OVERLOADED';
        default:
            return parseErrorCode(body) ? 'PROVIDER_REQUEST_FAILED' : 'PROVIDER_UNAVAILABLE';
    }
}
function classifyError(status, body) {
    const detail = summarize(body);
    switch (status) {
        case 400:
            return `Magic Hour rejected the request as invalid. ${detail}`.trim();
        case 401:
        case 403:
            return `Magic Hour refused the API key (HTTP ${status}). ${detail}`.trim();
        case 402:
            return (`Magic Hour has no credits left on this account (HTTP 402). ${detail} `.trim() +
                `This is one shared pool for every ISOBASH user, so video generation is paused until it refills. ` +
                `Check the pool on the admin video credits panel.`);
        case 404:
            return `Magic Hour does not serve this model or project. ${detail}`.trim();
        case 422:
            return `Magic Hour could not process these values. ${detail}`.trim();
        case 429:
            return `Magic Hour is rate limiting this key. ${detail}`.trim();
        case 500:
            return `Magic Hour reported an internal error (HTTP 500). ${detail}`.trim();
        case 503:
            return `Magic Hour is temporarily unavailable. ${detail}`.trim();
        default:
            return `Magic Hour returned HTTP ${status}. ${detail}`.trim();
    }
}
//# sourceMappingURL=magic-hour-video.provider.js.map