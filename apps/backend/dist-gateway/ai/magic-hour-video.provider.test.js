"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
const magic_hour_video_provider_1 = require("./magic-hour-video.provider");
const magic_hour_pricing_1 = require("./magic-hour.pricing");
const provider_types_1 = require("./provider.types");
let calls = [];
let originalFetch;
/** Answer each request from a queue of fixtures, recording what was asked. */
function stubFetch(responses) {
    let index = 0;
    globalThis.fetch = globals_1.jest.fn(async (input, init) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        let body = undefined;
        const raw = init?.body;
        if (typeof raw === 'string') {
            try {
                body = JSON.parse(raw);
            }
            catch {
                body = raw;
            }
        }
        calls.push({ url, method: init?.method ?? 'GET', body, headers: (init?.headers ?? {}) });
        const next = responses[Math.min(index, responses.length - 1)];
        index += 1;
        if (next.binary) {
            return new Response(new Uint8Array(next.binary), {
                status: next.status ?? 200,
                headers: { 'content-type': 'video/mp4', ...(next.headers ?? {}) },
            });
        }
        const text = typeof next.body === 'string' ? next.body : JSON.stringify(next.body ?? {});
        return new Response(text, {
            status: next.status ?? 200,
            headers: { 'content-type': 'application/json', ...(next.headers ?? {}) },
        });
    });
}
const created = (id) => ({ id, status: 'queued', credits_charged: 96, downloads: [] });
const completed = (id) => ({
    id,
    status: 'complete',
    type: 'TEXT_TO_VIDEO',
    width: 320,
    height: 180,
    end_seconds: 4,
    credits_charged: 96,
    downloads: [{ url: 'https://cdn.magichour.ai/clip.mp4', expires_at: '2026-10-01T00:00:00.000Z' }],
});
(0, globals_1.describe)('MagicHourVideoProvider', () => {
    (0, globals_1.beforeEach)(() => {
        originalFetch = globalThis.fetch;
        calls = [];
        process.env.MAGICHOUR_API_KEY = 'test-key';
        delete process.env.MAGICHOUR_VIDEO_ALLOWED_MODELS;
        delete process.env.MAGICHOUR_VIDEO_RESOLUTION;
        /**
         * Default to a `fetch` that fails loudly, so a test that forgets to stub cannot
         * quietly reach the real API. A live call would spend from a shared pool.
         */
        globalThis.fetch = globals_1.jest.fn(async (input) => {
            const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
            throw new Error(`UNSTUBBED NETWORK CALL to ${url}`);
        });
    });
    (0, globals_1.afterEach)(() => {
        globalThis.fetch = originalFetch;
        delete process.env.MAGICHOUR_API_KEY;
        delete process.env.MAGICHOUR_VIDEO_ALLOWED_MODELS;
        delete process.env.MAGICHOUR_VIDEO_RESOLUTION;
    });
    (0, globals_1.describe)('health and model selection', () => {
        (0, globals_1.it)('is unconfigured, with the reason, when there is no key', async () => {
            delete process.env.MAGICHOUR_API_KEY;
            const health = await new magic_hour_video_provider_1.MagicHourVideoProvider().health();
            (0, globals_1.expect)(health.status).toBe('unconfigured');
            (0, globals_1.expect)(health.detail).toContain('MAGICHOUR_API_KEY');
        });
        (0, globals_1.it)('offers only the free plan models by default', () => {
            const provider = new magic_hour_video_provider_1.MagicHourVideoProvider();
            (0, globals_1.expect)([...provider.enabledModels]).toEqual([...magic_hour_pricing_1.MAGIC_HOUR_FREE_MODELS]);
            (0, globals_1.expect)(provider.enabledModels).not.toContain('sora-2');
        });
        (0, globals_1.it)('registers exactly the models it will accept, so capabilities cannot drift from createJob', () => {
            process.env.MAGICHOUR_VIDEO_ALLOWED_MODELS = 'ltx-2.5, sora-2';
            const provider = new magic_hour_video_provider_1.MagicHourVideoProvider();
            (0, globals_1.expect)([...provider.enabledModels]).toEqual(['ltx-2.5', 'sora-2']);
            (0, globals_1.expect)(provider.defaultModel).toBe('ltx-2.5');
        });
        (0, globals_1.it)('refuses to generate anything but video through the generic AI interface', async () => {
            await (0, globals_1.expect)(new magic_hour_video_provider_1.MagicHourVideoProvider().execute({ capability: 'text-generation', messages: [] })).rejects.toMatchObject({
                code: 'CAPABILITY_UNSUPPORTED',
            });
        });
    });
    (0, globals_1.describe)('createJob', () => {
        (0, globals_1.it)('posts the documented text-to-video body, at the free plan resolution', async () => {
            stubFetch([{ body: created('proj-1') }]);
            const job = await new magic_hour_video_provider_1.MagicHourVideoProvider().createJob({ prompt: '  a brass orrery  ', durationSeconds: 4 });
            (0, globals_1.expect)(calls[0].url).toBe('https://api.magichour.ai/v1/text-to-video');
            (0, globals_1.expect)(calls[0].body).toMatchObject({
                end_seconds: 4,
                model: 'ltx-2.5',
                resolution: magic_hour_pricing_1.MAGIC_HOUR_FREE_MAX_RESOLUTION,
                audio: false,
                style: { prompt: 'a brass orrery' },
            });
            (0, globals_1.expect)(job.id).toBe('proj-1');
        });
        (0, globals_1.it)('marks the create-time credit figure as an estimate, because it is not the final one', async () => {
            stubFetch([{ body: created('proj-2') }]);
            const job = await new magic_hour_video_provider_1.MagicHourVideoProvider().createJob({ prompt: 'a tide', durationSeconds: 4 });
            (0, globals_1.expect)(job.creditsCharged).toBe(96);
            (0, globals_1.expect)(job.creditsChargedIsEstimate).toBe(true);
        });
        (0, globals_1.it)('refuses a model the free plan cannot pay for, before it is submitted', async () => {
            stubFetch([{ body: created('proj-3') }]);
            await (0, globals_1.expect)(new magic_hour_video_provider_1.MagicHourVideoProvider().createJob({ prompt: 'a tide', model: 'sora-2' })).rejects.toBeInstanceOf(provider_types_1.AiProviderError);
            (0, globals_1.expect)(calls).toHaveLength(0);
        });
        (0, globals_1.it)('refuses an empty prompt rather than sending one', async () => {
            stubFetch([{ body: created('proj-4') }]);
            await (0, globals_1.expect)(new magic_hour_video_provider_1.MagicHourVideoProvider().createJob({ prompt: '   ' })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
            (0, globals_1.expect)(calls).toHaveLength(0);
        });
        (0, globals_1.it)('rejects a response with no project id rather than tracking nothing', async () => {
            stubFetch([{ body: { status: 'queued' } }]);
            await (0, globals_1.expect)(new magic_hour_video_provider_1.MagicHourVideoProvider().createJob({ prompt: 'a tide' })).rejects.toMatchObject({
                code: 'EMPTY_PROVIDER_RESPONSE',
            });
        });
        (0, globals_1.it)('maps a provider error object onto the job instead of swallowing it', async () => {
            stubFetch([{ body: { id: 'proj-5', status: 'error', error: { code: 402, message: 'not enough credits' } } }]);
            const job = await new magic_hour_video_provider_1.MagicHourVideoProvider().getJob('proj-5');
            (0, globals_1.expect)(job.status).toBe('error');
            (0, globals_1.expect)(job.error?.message).toBe('not enough credits');
        });
    });
    (0, globals_1.describe)('image-to-video', () => {
        (0, globals_1.it)('uploads the first frame and sends the returned file path, not a link to our own route', async () => {
            stubFetch([
                { body: { items: [{ upload_url: 'https://storage.magichour.ai/put/abc', file_path: '/uploads/first-frame.png' }] } },
                { body: { id: 'proj-6', status: 'queued' } },
            ]);
            const job = await new magic_hour_video_provider_1.MagicHourVideoProvider().createJob({
                prompt: 'the tide comes in',
                image: { mimeType: 'image/png', data: Buffer.from('PNGFRAME').toString('base64') },
            });
            const grant = calls[0];
            (0, globals_1.expect)(grant.url).toBe('https://api.magichour.ai/v1/files/upload-urls');
            (0, globals_1.expect)(grant.method).toBe('POST');
            (0, globals_1.expect)(calls[1].method).toBe('PUT');
            (0, globals_1.expect)(calls[1].url).toBe('https://storage.magichour.ai/put/abc');
            (0, globals_1.expect)(calls[2].url).toBe('https://api.magichour.ai/v1/image-to-video');
            (0, globals_1.expect)(calls[2].body.assets.image_file_path).toBe('/uploads/first-frame.png');
            (0, globals_1.expect)(job.id).toBe('proj-6');
        });
        (0, globals_1.it)('refuses a first frame over the upload ceiling rather than trying', async () => {
            stubFetch([{ body: { items: [{ upload_url: 'https://storage.magichour.ai/put/abc', file_path: '/uploads/big.png' }] } }]);
            await (0, globals_1.expect)(new magic_hour_video_provider_1.MagicHourVideoProvider().createJob({
                prompt: 'a tide',
                image: { mimeType: 'image/png', data: Buffer.alloc(11 * 1024 * 1024).toString('base64') },
            })).rejects.toBeInstanceOf(provider_types_1.AiProviderError);
            (0, globals_1.expect)(calls).toHaveLength(0);
        });
    });
    (0, globals_1.describe)('polling', () => {
        (0, globals_1.it)('reads a finished project with its download link and its real cost', async () => {
            stubFetch([{ body: completed('proj-7') }]);
            const job = await new magic_hour_video_provider_1.MagicHourVideoProvider().getJob('proj-7');
            (0, globals_1.expect)(calls[0].url).toBe('https://api.magichour.ai/v1/video-projects/proj-7');
            (0, globals_1.expect)(job.status).toBe('complete');
            (0, globals_1.expect)(job.downloads[0].url).toBe('https://cdn.magichour.ai/clip.mp4');
            (0, globals_1.expect)(job.creditsCharged).toBe(96);
            (0, globals_1.expect)(job.creditsChargedIsEstimate).toBe(false);
        });
        (0, globals_1.it)('cancels best effort, and a failure to cancel is not fatal', async () => {
            stubFetch([{ status: 500, body: { message: 'already finished' } }]);
            await (0, globals_1.expect)(new magic_hour_video_provider_1.MagicHourVideoProvider().cancelJob('proj-8')).rejects.toBeInstanceOf(provider_types_1.AiProviderError);
            (0, globals_1.expect)(calls[0].method).toBe('DELETE');
        });
    });
    (0, globals_1.describe)('readCreditBalance', () => {
        (0, globals_1.it)('reads the shared pool from /v1/account', async () => {
            stubFetch([{ body: { credits: 400, tier: 'free' } }]);
            await (0, globals_1.expect)(new magic_hour_video_provider_1.MagicHourVideoProvider().readCreditBalance()).resolves.toEqual({ balance: 400, readable: true, tier: 'free' });
            (0, globals_1.expect)(calls[0].url).toBe('https://api.magichour.ai/v1/account');
        });
        (0, globals_1.it)('reports an unreadable balance as unreadable, never as zero', async () => {
            stubFetch([{ body: { tier: 'free' } }]);
            await (0, globals_1.expect)(new magic_hour_video_provider_1.MagicHourVideoProvider().readCreditBalance()).resolves.toMatchObject({ balance: 0, readable: false });
        });
        (0, globals_1.it)('reports an unreadable balance when the endpoint is down', async () => {
            stubFetch([{ status: 500, body: { message: 'boom' } }]);
            await (0, globals_1.expect)(new magic_hour_video_provider_1.MagicHourVideoProvider().readCreditBalance()).resolves.toMatchObject({ readable: false });
        });
        (0, globals_1.it)('spends nothing when there is no key', async () => {
            delete process.env.MAGICHOUR_API_KEY;
            await (0, globals_1.expect)(new magic_hour_video_provider_1.MagicHourVideoProvider().readCreditBalance()).resolves.toEqual({ balance: 0, readable: false });
            (0, globals_1.expect)(calls).toHaveLength(0);
        });
    });
    (0, globals_1.describe)('downloadResult', () => {
        const job = (downloads) => ({
            id: 'proj-9',
            status: 'complete',
            creditsCharged: 96,
            creditsChargedIsEstimate: false,
            width: 320,
            height: 180,
            durationSeconds: 4,
            progressPercent: null,
            error: null,
            type: 'TEXT_TO_VIDEO',
            downloads,
        });
        (0, globals_1.it)('refuses a completed project with no download instead of storing nothing', async () => {
            await (0, globals_1.expect)(new magic_hour_video_provider_1.MagicHourVideoProvider().downloadResult(job([]))).rejects.toMatchObject({
                code: 'EMPTY_PROVIDER_RESPONSE',
            });
        });
        (0, globals_1.it)('refuses a zero byte download', async () => {
            stubFetch([{ binary: Buffer.alloc(0) }]);
            await (0, globals_1.expect)(new magic_hour_video_provider_1.MagicHourVideoProvider().downloadResult(job([{ url: 'https://cdn.magichour.ai/clip.mp4', expiresAt: null }]))).rejects.toMatchObject({
                code: 'EMPTY_PROVIDER_RESPONSE',
            });
        });
        (0, globals_1.it)('refuses a download that announced more than the ceiling', async () => {
            stubFetch([{ binary: Buffer.alloc(16), headers: { 'content-length': String(999 * 1024 * 1024) } }]);
            await (0, globals_1.expect)(new magic_hour_video_provider_1.MagicHourVideoProvider().downloadResult(job([{ url: 'https://cdn.magichour.ai/clip.mp4', expiresAt: null }]))).rejects.toMatchObject({
                code: 'PROVIDER_REQUEST_FAILED',
            });
        });
        (0, globals_1.it)('returns the bytes as base64 and claims only the provider type', async () => {
            const clip = Buffer.from('A_REAL_MP4_PAYLOAD');
            stubFetch([{ binary: clip }]);
            const result = await new magic_hour_video_provider_1.MagicHourVideoProvider().downloadResult(job([{ url: 'https://cdn.magichour.ai/clip.mp4', expiresAt: null }]));
            (0, globals_1.expect)(Buffer.from(result.data, 'base64').equals(clip)).toBe(true);
            (0, globals_1.expect)(result.mimeType).toBe('video/mp4');
        });
    });
});
(0, globals_1.describe)('estimateMagicHourCredits', () => {
    (0, globals_1.it)('prices a free plan render at its published per-second rate', () => {
        (0, globals_1.expect)((0, magic_hour_pricing_1.estimateMagicHourCredits)({ model: 'ltx-2.5', resolution: '480p', seconds: 4, withAudio: false })).toEqual({
            creditsPerSecond: 24,
            estimated: 96,
            audioSupported: true,
            audioSurcharge: 0,
        });
    });
    (0, globals_1.it)('charges nothing extra for a silent render, rather than calling it unpriceable', () => {
        const cost = (0, magic_hour_pricing_1.estimateMagicHourCredits)({ model: 'seedance-2.0', resolution: '720p', seconds: 5, withAudio: false });
        (0, globals_1.expect)(cost.audioSurcharge).toBe(0);
        (0, globals_1.expect)(cost.estimated).toBe(cost.creditsPerSecond === null ? null : cost.creditsPerSecond * 5);
    });
    (0, globals_1.it)('returns nulls for a combination that is not in the table, instead of guessing', () => {
        (0, globals_1.expect)((0, magic_hour_pricing_1.estimateMagicHourCredits)({ model: 'ltx-2.5', resolution: '4k', seconds: 4, withAudio: false })).toMatchObject({
            creditsPerSecond: null,
            estimated: null,
        });
    });
    (0, globals_1.it)('knows which models cannot render audio at all', () => {
        (0, globals_1.expect)((0, magic_hour_pricing_1.estimateMagicHourCredits)({ model: 'wan-2.2', resolution: '720p', seconds: 4, withAudio: true }).audioSupported).toBe(false);
        (0, globals_1.expect)((0, magic_hour_pricing_1.estimateMagicHourCredits)({ model: 'ltx-2.5', resolution: '480p', seconds: 4, withAudio: true }).audioSupported).toBe(true);
    });
    (0, globals_1.it)('separates the free models from the whole catalogue', () => {
        (0, globals_1.expect)((0, magic_hour_pricing_1.isMagicHourModel)('ltx-2.5')).toBe(true);
        (0, globals_1.expect)((0, magic_hour_pricing_1.isMagicHourModel)('sora-2')).toBe(true);
        (0, globals_1.expect)((0, magic_hour_pricing_1.isMagicHourModel)('gemini-3.1-flash-image')).toBe(false);
        (0, globals_1.expect)(magic_hour_pricing_1.MAGIC_HOUR_FREE_MODELS).not.toContain('sora-2');
    });
});
//# sourceMappingURL=magic-hour-video.provider.test.js.map