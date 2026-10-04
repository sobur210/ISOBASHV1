import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { OpenRouterImageProvider } from './openrouter-image.provider';
import { AiProviderError } from './provider.types';

let originalFetch: typeof globalThis.fetch;
let originalKey: string | undefined;
let originalModel: string | undefined;
let calls: Array<{ url: string; init?: RequestInit }> = [];

describe('OpenRouterImageProvider', () => {
  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalKey = process.env.OPENROUTER_API_IMAGE_VIDEO;
    originalModel = process.env.OPENROUTER_IMAGE_MODEL;
    process.env.OPENROUTER_API_IMAGE_VIDEO = 'test-key';
    process.env.OPENROUTER_IMAGE_MODEL = 'test/image-model';
    calls = [];
    globalThis.fetch = jest.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      calls.push({ url, init });
      return new Response(
        JSON.stringify({
          data: [{ b64_json: 'aW1hZ2U=', media_type: 'image/webp', revised_prompt: 'A revised description' }],
          usage: { prompt_tokens: 12, completion_tokens: 34 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as unknown as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENROUTER_API_IMAGE_VIDEO;
    else process.env.OPENROUTER_API_IMAGE_VIDEO = originalKey;
    if (originalModel === undefined) delete process.env.OPENROUTER_IMAGE_MODEL;
    else process.env.OPENROUTER_IMAGE_MODEL = originalModel;
  });

  it('uses the OpenRouter image endpoint and returns its base64 image and usage', async () => {
    const result = await new OpenRouterImageProvider().generateImage({
      prompt: '  a red panda  ',
      aspectRatio: '16:9',
      count: 2,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://openrouter.ai/api/v1/images');
    expect(calls[0].init?.headers).toMatchObject({ Authorization: ['Bearer', 'test-key'].join(' ') });
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      model: 'test/image-model',
      prompt: 'a red panda',
      n: 2,
      aspect_ratio: '16:9',
    });
    expect(result).toMatchObject({
      provider: 'openrouter',
      model: 'test/image-model',
      images: [{ mimeType: 'image/webp', data: 'aW1hZ2U=', note: 'A revised description' }],
      requested: 2,
      usage: { inputTokens: 12, outputTokens: 34 },
    });
  });

  it('reports OpenRouter authentication and model failures clearly', async () => {
    globalThis.fetch = jest.fn(async () =>
      new Response(JSON.stringify({ error: { message: 'invalid model id' } }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      }),
    ) as unknown as typeof globalThis.fetch;

    await expect(new OpenRouterImageProvider().generateImage({ prompt: 'a red panda' })).rejects.toMatchObject({
      code: 'MODEL_NOT_AVAILABLE',
    });
    await expect(new OpenRouterImageProvider().generateImage({ prompt: 'a red panda' })).rejects.toThrow('invalid model id');
  });

  it('does not submit when the key is missing', async () => {
    delete process.env.OPENROUTER_API_IMAGE_VIDEO;

    await expect(new OpenRouterImageProvider().generateImage({ prompt: 'a red panda' })).rejects.toThrow(
      /OPENROUTER_API_IMAGE_VIDEO/,
    );
    expect(calls).toHaveLength(0);
  });

  it('reports unconfigured health without a key and rejects empty prompts', async () => {
    delete process.env.OPENROUTER_API_IMAGE_VIDEO;
    await expect(new OpenRouterImageProvider().health()).resolves.toMatchObject({ status: 'unconfigured' });
    process.env.OPENROUTER_API_IMAGE_VIDEO = 'test-key';

    await expect(new OpenRouterImageProvider().generateImage({ prompt: '   ' })).rejects.toThrow(AiProviderError);
    expect(calls).toHaveLength(0);
  });
});
