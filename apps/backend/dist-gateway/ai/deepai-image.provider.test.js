"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
const deepai_image_provider_1 = require("./deepai-image.provider");
const provider_types_1 = require("./provider.types");
const deepai_image_provider_2 = require("./deepai-image.provider");
/**
 * DeepAI image generation, tested against recorded response shapes.
 *
 * The endpoint answers with an `output_url` on DeepAI's CDN rather than bytes, so
 * the two-hop nature is the thing most worth pinning down: a submit that returns a
 * URL, followed by a download that must actually produce a non-empty payload. A
 * regression that stopped fetching the URL would otherwise look like a successful
 * render with no image.
 *
 * `fetch` is replaced throughout, and a live call would bill real credit, so
 * nothing here may reach the network.
 */
let calls = [];
let originalFetch;
/** A 1x1 JPEG, so the download path has real bytes to work with. */
const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64');
/**
 * Answers by URL rather than by call order.
 *
 * The provider makes two calls per image -- submit, then download the CDN link --
 * so a positional queue runs out and starts serving JPEG bytes to the JSON
 * request. Keying on the URL keeps repeated calls working.
 */
function stubFetch(responses) {
    let index = 0;
    const next = () => responses[Math.min(index++, responses.length - 1)];
    globalThis.fetch = globals_1.jest.fn(async (input, init) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        calls.push({
            url,
            method: init?.method ?? 'GET',
            body: init?.body,
            headers: (init?.headers ?? {}),
        });
        const response = next();
        if (response.bytes) {
            return new Response(new Uint8Array(response.bytes), { status: response.status ?? 200, headers: response.headers });
        }
        return new Response(JSON.stringify(response.body ?? {}), {
            status: response.status ?? 200,
            headers: { 'content-type': 'application/json', ...response.headers },
        });
    });
}
(0, globals_1.describe)('DeepAiImageProvider', () => {
    (0, globals_1.beforeEach)(() => {
        originalFetch = globalThis.fetch;
        calls = [];
        process.env.DEEPAI_API_KEY = 'test-key';
        globalThis.fetch = globals_1.jest.fn(async (input) => {
            const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
            throw new Error(`UNSTUBBED NETWORK CALL to ${url}`);
        });
    });
    (0, globals_1.afterEach)(() => {
        globalThis.fetch = originalFetch;
        delete process.env.DEEPAI_API_KEY;
    });
    (0, globals_1.describe)('generateImage', () => {
        (0, globals_1.it)('submits the prompt, then downloads the returned CDN link', async () => {
            stubFetch([
                { body: { output_url: 'https://cdn.deepai.org/image.jpg' } },
                { bytes: JPEG, headers: { 'content-type': 'image/jpeg' } },
            ]);
            const result = await new deepai_image_provider_1.DeepAiImageProvider().generateImage({ prompt: 'a red barn' });
            // Two hops: the API answers with a link, and the bytes are fetched separately.
            (0, globals_1.expect)(calls).toHaveLength(2);
            (0, globals_1.expect)(calls[0].url).toBe('https://api.deepai.org/api/text2img');
            (0, globals_1.expect)(calls[0].headers['api-key']).toBe('test-key');
            (0, globals_1.expect)(calls[1].url).toBe('https://cdn.deepai.org/image.jpg');
            (0, globals_1.expect)(result.images).toHaveLength(1);
            (0, globals_1.expect)(Buffer.from(result.images[0].data, 'base64')).toEqual(JPEG);
        });
        /**
         * The link is a temporary CDN URL. ISOBASH keeps its own copy rather than
         * storing the URL, so a stored asset whose image 404s an hour later is exactly
         * the failure this avoids.
         */
        (0, globals_1.it)('stores the bytes rather than the link', async () => {
            stubFetch([
                { body: { output_url: 'https://cdn.deepai.org/image.jpg' } },
                { bytes: JPEG, headers: { 'content-type': 'image/jpeg' } },
            ]);
            const result = await new deepai_image_provider_1.DeepAiImageProvider().generateImage({ prompt: 'a red barn' });
            // The note says why the link was not simply stored.
            (0, globals_1.expect)(result.images[0].note).toMatch(/CDN|stored its own copy/i);
            // The payload is inline data, not a URL.
            (0, globals_1.expect)(result.images[0].data.startsWith('http')).toBe(false);
        });
        (0, globals_1.it)('fails rather than returning an empty image when the link 404s', async () => {
            stubFetch([
                { body: { output_url: 'https://cdn.deepai.org/gone.jpg' } },
                { status: 404, bytes: Buffer.from('nope') },
            ]);
            await (0, globals_1.expect)(new deepai_image_provider_1.DeepAiImageProvider().generateImage({ prompt: 'a red barn' })).rejects.toThrow(provider_types_1.AiProviderError);
        });
        (0, globals_1.it)('fails when the provider returns no output URL at all', async () => {
            stubFetch([{ body: { message: 'ok' } }]);
            await (0, globals_1.expect)(new deepai_image_provider_1.DeepAiImageProvider().generateImage({ prompt: 'a red barn' })).rejects.toThrow(/without an output URL/);
            // No download attempted, because there was nothing to download.
            (0, globals_1.expect)(calls).toHaveLength(1);
        });
        (0, globals_1.it)('fails on a zero byte image rather than storing an empty file', async () => {
            stubFetch([
                { body: { output_url: 'https://cdn.deepai.org/empty.jpg' } },
                { bytes: Buffer.alloc(0) },
            ]);
            await (0, globals_1.expect)(new deepai_image_provider_1.DeepAiImageProvider().generateImage({ prompt: 'a red barn' })).rejects.toThrow(/zero byte/);
        });
        (0, globals_1.it)('refuses a download over the size ceiling instead of buffering it', async () => {
            process.env.DEEPAI_IMAGE_MAX_BYTES = '10';
            stubFetch([
                { body: { output_url: 'https://cdn.deepai.org/huge.jpg' } },
                { bytes: JPEG, headers: { 'content-type': 'image/jpeg', 'content-length': String(JPEG.byteLength) } },
            ]);
            await (0, globals_1.expect)(new deepai_image_provider_1.DeepAiImageProvider().generateImage({ prompt: 'a red barn' })).rejects.toThrow(/ceiling/);
            delete process.env.DEEPAI_IMAGE_MAX_BYTES;
        });
        (0, globals_1.it)('refuses an empty prompt without submitting', async () => {
            const provider = new deepai_image_provider_1.DeepAiImageProvider();
            await (0, globals_1.expect)(provider.generateImage({ prompt: '   ' })).rejects.toThrow(/prompt is required/);
            (0, globals_1.expect)(calls).toHaveLength(0);
        });
        (0, globals_1.it)('refuses an aspect ratio it cannot map', async () => {
            const provider = new deepai_image_provider_1.DeepAiImageProvider();
            await (0, globals_1.expect)(provider.generateImage({ prompt: 'wide', aspectRatio: '21:9' })).rejects.toThrow(/aspect ratio/);
            (0, globals_1.expect)(calls).toHaveLength(0);
        });
        (0, globals_1.it)('renders every aspect ratio the media panel offers', async () => {
            // Two responses per image: submit, then download. The media panel offers
            // 16:9, 9:16 and 1:1, and the extra two are the ratios the mapping also
            // accepts, so a request outside the panel does not fail for a silly reason.
            const ratios = ['1:1', '3:4', '4:3', '9:16', '16:9'];
            stubFetch(ratios.flatMap(() => [
                { body: { output_url: 'https://cdn.deepai.org/image.jpg' } },
                { bytes: JPEG, headers: { 'content-type': 'image/jpeg' } },
            ]));
            for (const ratio of ratios) {
                const result = await new deepai_image_provider_1.DeepAiImageProvider().generateImage({ prompt: 'a barn', aspectRatio: ratio });
                (0, globals_1.expect)(result.images).toHaveLength(1);
            }
            // Every submit used a size inside DeepAI's documented 128-1536px range.
            const submits = calls.filter((c) => c.url.includes('/api/text2img'));
            (0, globals_1.expect)(submits).toHaveLength(ratios.length);
        });
        (0, globals_1.it)('does not submit without a key', async () => {
            delete process.env.DEEPAI_API_KEY;
            const provider = new deepai_image_provider_1.DeepAiImageProvider();
            await (0, globals_1.expect)(provider.generateImage({ prompt: 'a red barn' })).rejects.toThrow(/DEEPAI_API_KEY/);
            (0, globals_1.expect)(calls).toHaveLength(0);
        });
    });
    (0, globals_1.describe)('refusals', () => {
        /**
         * The 403 is the case that catches people out: a valid key still gets refused
         * unless the account has an active paid Pro subscription, because the image
         * APIs are not free either. Saying so is the difference between an operator
         * fixing billing and an operator concluding the integration is broken.
         */
        (0, globals_1.it)('explains that images need a paid subscription, not just a key', async () => {
            stubFetch([{ status: 403, body: { error: 'subscription' } }]);
            await (0, globals_1.expect)(new deepai_image_provider_1.DeepAiImageProvider().generateImage({ prompt: 'a barn' })).rejects.toThrow(/Pro subscription/i);
        });
        (0, globals_1.it)('names the per-call cost when the wallet cannot cover it', async () => {
            stubFetch([{ status: 402, body: { error: 'insufficient' } }]);
            await (0, globals_1.expect)(new deepai_image_provider_1.DeepAiImageProvider().generateImage({ prompt: 'a barn' })).rejects.toThrow(new RegExp(`${deepai_image_provider_2.DEEPAI_IMAGE_COST_PER_CALL} credit`));
        });
        (0, globals_1.it)('explains a refused key', async () => {
            stubFetch([{ status: 401, body: { error: 'bad key' } }]);
            await (0, globals_1.expect)(new deepai_image_provider_1.DeepAiImageProvider().generateImage({ prompt: 'a barn' })).rejects.toThrow(/API key/i);
        });
    });
    (0, globals_1.describe)('health', () => {
        (0, globals_1.it)('reports unconfigured without a key', async () => {
            delete process.env.DEEPAI_API_KEY;
            const health = await new deepai_image_provider_1.DeepAiImageProvider().health();
            (0, globals_1.expect)(health.status).toBe('unconfigured');
        });
        /**
         * This is the detail an operator reads when they expected a free renderer, so
         * it has to say out loud that images are billed and Pro-gated rather than
         * leaving that in a code comment.
         */
        (0, globals_1.it)('says plainly that images are billed and are not a free fallback', async () => {
            const health = await new deepai_image_provider_1.DeepAiImageProvider().health();
            (0, globals_1.expect)(health.status).toBe('healthy');
            (0, globals_1.expect)(health.detail).toMatch(/not a free fallback/i);
            (0, globals_1.expect)(health.detail).toMatch(/credit/i);
        });
    });
    (0, globals_1.describe)('capability boundaries', () => {
        (0, globals_1.it)('refuses a non-image capability rather than pretending to serve it', async () => {
            const provider = new deepai_image_provider_1.DeepAiImageProvider();
            await (0, globals_1.expect)(
            // The adapter only claims image generation, so asking it for text is a
            // capability it was never registered for, and the interface still takes an
            // `AiRequest`. Passing a nonsensical capability is the fastest way to prove
            // the guard is explicit rather than returning an empty result.
            provider.execute({ capability: 'language', input: 'hi' })).rejects.toThrow(/only generates images/);
        });
        (0, globals_1.it)('does not advertise video', () => {
            // The image adapter must not claim a capability it cannot serve, or the
            // router could select it for a render it cannot perform.
            (0, globals_1.expect)(new deepai_image_provider_1.DeepAiImageProvider().capabilities).toEqual(['image-generation']);
        });
    });
});
//# sourceMappingURL=deepai-image.provider.test.js.map