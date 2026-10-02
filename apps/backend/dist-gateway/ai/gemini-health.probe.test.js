"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Regression coverage for the Gemini health probe.
 *
 * The bug: the probe asked for `maxOutputTokens: 1` and treated HTTP 200 as proof
 * the model works. On a thinking model that budget is consumed entirely by
 * `thoughtsTokenCount`, so the provider answers 200 with `finishReason:
 * MAX_TOKENS` and zero text parts. Health reported "healthy" for a model that
 * could not complete a one-word reply, and the admin panel showed a green light
 * on a provider that would fail every real request.
 *
 * Both cases below are byte-shaped like real Gemini responses.
 */
const globals_1 = require("@jest/globals");
// The provider reads these at construction, so they must be set before import.
process.env.GEMINI_API_KEY = 'test-key';
process.env.GEMINI_API_BASE_URL = 'https://gemini.invalid/v1beta';
process.env.GEMINI_MODEL_CHECK_TTL_MS = '0';
const gemini_provider_1 = require("./gemini.provider");
const MODELS_OK = {
    status: 200,
    body: { models: [{ name: 'models/gemini-3.7-flash' }] },
};
/** The exact shape a thinking model returns when the budget is too small. */
const MAX_TOKENS_NO_TEXT = {
    status: 200,
    body: {
        candidates: [{ content: {}, finishReason: 'MAX_TOKENS', index: 0 }],
        usageMetadata: { promptTokenCount: 7, thoughtsTokenCount: 12 },
        modelVersion: 'gemini-3.7-flash',
    },
};
const HAS_TEXT = {
    status: 200,
    body: {
        candidates: [{ content: { parts: [{ text: 'pong' }] }, finishReason: 'STOP', index: 0 }],
        modelVersion: 'gemini-3.7-flash',
    },
};
const QUOTA_REFUSAL = {
    status: 429,
    body: {
        error: {
            code: 429,
            message: 'Quota exceeded for metric: generate_content_free_tier_requests, limit: 0',
            status: 'RESOURCE_EXHAUSTED',
        },
    },
};
const realFetch = globalThis.fetch;
function stubFetch(responses) {
    const probeBodies = [];
    let index = 0;
    globalThis.fetch = (async (_url, init) => {
        const next = responses[Math.min(index, responses.length - 1)];
        index += 1;
        if (init?.body)
            probeBodies.push(JSON.parse(String(init.body)));
        return {
            ok: next.status >= 200 && next.status < 300,
            status: next.status,
            json: async () => next.body,
        };
    });
    return probeBodies;
}
(0, globals_1.beforeEach)(() => {
    process.env.GEMINI_API_KEY = 'test-key';
    delete process.env.GEMINI_MODEL_CHECK_TTL_MS;
});
(0, globals_1.afterEach)(() => {
    globalThis.fetch = realFetch;
});
(0, globals_1.describe)('GeminiProvider.health model probe', () => {
    (0, globals_1.it)('reports unavailable when the model answers 200 with no output text', async () => {
        stubFetch([MODELS_OK, MAX_TOKENS_NO_TEXT]);
        const health = await new gemini_provider_1.GeminiProvider().health();
        (0, globals_1.expect)(health.status).toBe('unavailable');
        (0, globals_1.expect)(health.detail).toContain('no output text');
        (0, globals_1.expect)(health.detail).toContain('MAX_TOKENS');
    });
    /**
     * The probe has to leave room for thinking, otherwise it reintroduces the exact
     * failure it exists to catch on a model whose reasoning is longer than the cap.
     */
    (0, globals_1.it)('asks for a budget large enough for a thinking model to actually answer', async () => {
        const bodies = stubFetch([MODELS_OK, HAS_TEXT]);
        await new gemini_provider_1.GeminiProvider().health();
        const probe = bodies[bodies.length - 1];
        (0, globals_1.expect)(probe.generationConfig.maxOutputTokens).toBeGreaterThan(100);
    });
    (0, globals_1.it)('reports healthy only when the model returns real text', async () => {
        stubFetch([MODELS_OK, HAS_TEXT]);
        const health = await new gemini_provider_1.GeminiProvider().health();
        (0, globals_1.expect)(health.status).toBe('healthy');
        (0, globals_1.expect)(health.detail).toContain('gemini-3.7-flash');
    });
    (0, globals_1.it)('still surfaces a quota refusal as unavailable', async () => {
        stubFetch([MODELS_OK, QUOTA_REFUSAL]);
        const health = await new gemini_provider_1.GeminiProvider().health();
        (0, globals_1.expect)(health.status).toBe('unavailable');
        (0, globals_1.expect)(health.detail).toContain('Quota exceeded');
    });
});
//# sourceMappingURL=gemini-health.probe.test.js.map