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
import { describe, expect, it, beforeEach, afterEach } from '@jest/globals';

// The provider reads these at construction, so they must be set before import.
process.env.GEMINI_API_KEY = 'test-key';
process.env.GEMINI_API_BASE_URL = 'https://gemini.invalid/v1beta';
process.env.GEMINI_MODEL_CHECK_TTL_MS = '0';

import { GeminiProvider } from './gemini.provider';

type ModelsResponse = {
  status: number;
  body: unknown;
};

const MODELS_OK: ModelsResponse = {
  status: 200,
  body: { models: [{ name: 'models/gemini-3.7-flash' }] },
};

/** The exact shape a thinking model returns when the budget is too small. */
const MAX_TOKENS_NO_TEXT: ModelsResponse = {
  status: 200,
  body: {
    candidates: [{ content: {}, finishReason: 'MAX_TOKENS', index: 0 }],
    usageMetadata: { promptTokenCount: 7, thoughtsTokenCount: 12 },
    modelVersion: 'gemini-3.7-flash',
  },
};

const HAS_TEXT: ModelsResponse = {
  status: 200,
  body: {
    candidates: [{ content: { parts: [{ text: 'pong' }] }, finishReason: 'STOP', index: 0 }],
    modelVersion: 'gemini-3.7-flash',
  },
};

const QUOTA_REFUSAL: ModelsResponse = {
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

function stubFetch(responses: ModelsResponse[]) {
  const probeBodies: any[] = [];
  let index = 0;
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    const next = responses[Math.min(index, responses.length - 1)];
    index += 1;
    if (init?.body) probeBodies.push(JSON.parse(String(init.body)));
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      json: async () => next.body,
    };
  }) as typeof fetch;
  return probeBodies;
}

beforeEach(() => {
  process.env.GEMINI_API_KEY = 'test-key';
  delete process.env.GEMINI_MODEL_CHECK_TTL_MS;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('GeminiProvider.health model probe', () => {
  it('reports unavailable when the model answers 200 with no output text', async () => {
    stubFetch([MODELS_OK, MAX_TOKENS_NO_TEXT]);
    const health = await new GeminiProvider().health();

    expect(health.status).toBe('unavailable');
    expect(health.detail).toContain('no output text');
    expect(health.detail).toContain('MAX_TOKENS');
  });

  /**
   * The probe has to leave room for thinking, otherwise it reintroduces the exact
   * failure it exists to catch on a model whose reasoning is longer than the cap.
   */
  it('asks for a budget large enough for a thinking model to actually answer', async () => {
    const bodies = stubFetch([MODELS_OK, HAS_TEXT]);
    await new GeminiProvider().health();

    const probe = bodies[bodies.length - 1];
    expect(probe.generationConfig.maxOutputTokens).toBeGreaterThan(100);
  });

  it('reports healthy only when the model returns real text', async () => {
    stubFetch([MODELS_OK, HAS_TEXT]);
    const health = await new GeminiProvider().health();

    expect(health.status).toBe('healthy');
    expect(health.detail).toContain('gemini-3.7-flash');
  });

  it('still surfaces a quota refusal as unavailable', async () => {
    stubFetch([MODELS_OK, QUOTA_REFUSAL]);
    const health = await new GeminiProvider().health();

    expect(health.status).toBe('unavailable');
    expect(health.detail).toContain('Quota exceeded');
  });
});