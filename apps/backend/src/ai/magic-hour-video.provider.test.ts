import { describe, expect, it, beforeEach, afterEach, jest } from '@jest/globals';
import { MagicHourVideoProvider } from './magic-hour-video.provider';
import {
  MAGIC_HOUR_FREE_MAX_RESOLUTION,
  MAGIC_HOUR_FREE_MODELS,
  estimateMagicHourCredits,
  isMagicHourModel,
} from './magic-hour.pricing';
import { AiProviderError } from './provider.types';
import type { VideoJob } from './video-provider.types';

/**
 * Magic Hour video and its pricing, tested against recorded response shapes.
 *
 * The fixtures are the parts of the API this feature depends on: the project id that
 * identifies a render, `status` and `downloads[]` for polling, `credits_charged` for
 * the ledger, `/v1/account` for the one balance the provider reports, and the
 * presigned upload used for an image-to-video first frame.
 *
 * No key and no network: `fetch` is replaced, so a regression shows up here rather
 * than as a real charge against a pool that is shared by every ISOBASH user.
 */

type Call = { url: string; method: string; body: unknown; headers: Record<string, string> };

let calls: Call[] = [];
let originalFetch: typeof globalThis.fetch;

/** Answer each request from a queue of fixtures, recording what was asked. */
function stubFetch(responses: Array<{ status?: number; body?: unknown; binary?: Buffer; headers?: Record<string, string> }>) {
  let index = 0;
  globalThis.fetch = jest.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    let body: unknown = undefined;
    const raw = init?.body;
    if (typeof raw === 'string') {
      try {
        body = JSON.parse(raw);
      } catch {
        body = raw;
      }
    }
    calls.push({ url, method: init?.method ?? 'GET', body, headers: (init?.headers ?? {}) as Record<string, string> });
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
  }) as unknown as typeof globalThis.fetch;
}

const created = (id: string) => ({ id, status: 'queued', credits_charged: 96, downloads: [] });
const completed = (id: string) => ({
  id,
  status: 'complete',
  type: 'TEXT_TO_VIDEO',
  width: 320,
  height: 180,
  end_seconds: 4,
  credits_charged: 96,
  downloads: [{ url: 'https://cdn.magichour.ai/clip.mp4', expires_at: '2026-10-01T00:00:00.000Z' }],
});

describe('MagicHourVideoProvider', () => {
  beforeEach(() => {
    originalFetch = globalThis.fetch;
    calls = [];
    process.env.MAGICHOUR_API_KEY = 'test-key';
    delete process.env.MAGICHOUR_VIDEO_ALLOWED_MODELS;
    delete process.env.MAGICHOUR_VIDEO_RESOLUTION;
    /**
     * Default to a `fetch` that fails loudly, so a test that forgets to stub cannot
     * quietly reach the real API. A live call would spend from a shared pool.
     */
    globalThis.fetch = jest.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      throw new Error(`UNSTUBBED NETWORK CALL to ${url}`);
    }) as unknown as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.MAGICHOUR_API_KEY;
    delete process.env.MAGICHOUR_VIDEO_ALLOWED_MODELS;
    delete process.env.MAGICHOUR_VIDEO_RESOLUTION;
  });

  describe('health and model selection', () => {
    it('is unconfigured, with the reason, when there is no key', async () => {
      delete process.env.MAGICHOUR_API_KEY;
      const health = await new MagicHourVideoProvider().health();
      expect(health.status).toBe('unconfigured');
      expect(health.detail).toContain('MAGICHOUR_API_KEY');
    });

    it('offers only the free plan models by default', () => {
      const provider = new MagicHourVideoProvider();
      expect([...provider.enabledModels]).toEqual([...MAGIC_HOUR_FREE_MODELS]);
      expect(provider.enabledModels).not.toContain('sora-2');
    });

    it('registers exactly the models it will accept, so capabilities cannot drift from createJob', () => {
      process.env.MAGICHOUR_VIDEO_ALLOWED_MODELS = 'ltx-2.5, sora-2';
      const provider = new MagicHourVideoProvider();
      expect([...provider.enabledModels]).toEqual(['ltx-2.5', 'sora-2']);
      expect(provider.defaultModel).toBe('ltx-2.5');
    });

    it('refuses to generate anything but video through the generic AI interface', async () => {
      await expect(new MagicHourVideoProvider().execute({ capability: 'text-generation', messages: [] } as never)).rejects.toMatchObject({
        code: 'CAPABILITY_UNSUPPORTED',
      });
    });
  });

  describe('createJob', () => {
    it('posts the documented text-to-video body, at the free plan resolution', async () => {
      stubFetch([{ body: created('proj-1') }]);
      const job = await new MagicHourVideoProvider().createJob({ prompt: '  a brass orrery  ', durationSeconds: 4 });
      expect(calls[0].url).toBe('https://api.magichour.ai/v1/text-to-video');
      expect(calls[0].body).toMatchObject({
        end_seconds: 4,
        model: 'ltx-2.5',
        resolution: MAGIC_HOUR_FREE_MAX_RESOLUTION,
        audio: false,
        style: { prompt: 'a brass orrery' },
      });
      expect(job.id).toBe('proj-1');
    });

    it('marks the create-time credit figure as an estimate, because it is not the final one', async () => {
      stubFetch([{ body: created('proj-2') }]);
      const job = await new MagicHourVideoProvider().createJob({ prompt: 'a tide', durationSeconds: 4 });
      expect(job.creditsCharged).toBe(96);
      expect(job.creditsChargedIsEstimate).toBe(true);
    });

    it('refuses a model the free plan cannot pay for, before it is submitted', async () => {
      stubFetch([{ body: created('proj-3') }]);
      await expect(new MagicHourVideoProvider().createJob({ prompt: 'a tide', model: 'sora-2' })).rejects.toBeInstanceOf(
        AiProviderError,
      );
      expect(calls).toHaveLength(0);
    });

    it('refuses an empty prompt rather than sending one', async () => {
      stubFetch([{ body: created('proj-4') }]);
      await expect(new MagicHourVideoProvider().createJob({ prompt: '   ' })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
      expect(calls).toHaveLength(0);
    });

    it('rejects a response with no project id rather than tracking nothing', async () => {
      stubFetch([{ body: { status: 'queued' } }]);
      await expect(new MagicHourVideoProvider().createJob({ prompt: 'a tide' })).rejects.toMatchObject({
        code: 'EMPTY_PROVIDER_RESPONSE',
      });
    });

    it('maps a provider error object onto the job instead of swallowing it', async () => {
      stubFetch([{ body: { id: 'proj-5', status: 'error', error: { code: 402, message: 'not enough credits' } } }]);
      const job = await new MagicHourVideoProvider().getJob('proj-5');
      expect(job.status).toBe('error');
      expect(job.error?.message).toBe('not enough credits');
    });
  });

  describe('image-to-video', () => {
    it('uploads the first frame and sends the returned file path, not a link to our own route', async () => {
      stubFetch([
        { body: { items: [{ upload_url: 'https://storage.magichour.ai/put/abc', file_path: '/uploads/first-frame.png' }] } },
        { body: { id: 'proj-6', status: 'queued' } },
      ]);
      const job = await new MagicHourVideoProvider().createJob({
        prompt: 'the tide comes in',
        image: { mimeType: 'image/png', data: Buffer.from('PNGFRAME').toString('base64') },
      });
      const grant = calls[0];
      expect(grant.url).toBe('https://api.magichour.ai/v1/files/upload-urls');
      expect(grant.method).toBe('POST');
      expect(calls[1].method).toBe('PUT');
      expect(calls[1].url).toBe('https://storage.magichour.ai/put/abc');
      expect(calls[2].url).toBe('https://api.magichour.ai/v1/image-to-video');
      expect((calls[2].body as { assets: { image_file_path: string } }).assets.image_file_path).toBe('/uploads/first-frame.png');
      expect(job.id).toBe('proj-6');
    });

    it('refuses a first frame over the upload ceiling rather than trying', async () => {
      stubFetch([{ body: { items: [{ upload_url: 'https://storage.magichour.ai/put/abc', file_path: '/uploads/big.png' }] } }]);
      await expect(
        new MagicHourVideoProvider().createJob({
          prompt: 'a tide',
          image: { mimeType: 'image/png', data: Buffer.alloc(11 * 1024 * 1024).toString('base64') },
        }),
      ).rejects.toBeInstanceOf(AiProviderError);
      expect(calls).toHaveLength(0);
    });
  });

  describe('polling', () => {
    it('reads a finished project with its download link and its real cost', async () => {
      stubFetch([{ body: completed('proj-7') }]);
      const job = await new MagicHourVideoProvider().getJob('proj-7');
      expect(calls[0].url).toBe('https://api.magichour.ai/v1/video-projects/proj-7');
      expect(job.status).toBe('complete');
      expect(job.downloads[0].url).toBe('https://cdn.magichour.ai/clip.mp4');
      expect(job.creditsCharged).toBe(96);
      expect(job.creditsChargedIsEstimate).toBe(false);
    });

    it('cancels best effort, and a failure to cancel is not fatal', async () => {
      stubFetch([{ status: 500, body: { message: 'already finished' } }]);
      await expect(new MagicHourVideoProvider().cancelJob('proj-8')).rejects.toBeInstanceOf(AiProviderError);
      expect(calls[0].method).toBe('DELETE');
    });
  });

  describe('readCreditBalance', () => {
    it('reads the shared pool from /v1/account', async () => {
      stubFetch([{ body: { credits: 400, tier: 'free' } }]);
      await expect(new MagicHourVideoProvider().readCreditBalance()).resolves.toEqual({ balance: 400, readable: true, tier: 'free' });
      expect(calls[0].url).toBe('https://api.magichour.ai/v1/account');
    });

    it('reports an unreadable balance as unreadable, never as zero', async () => {
      stubFetch([{ body: { tier: 'free' } }]);
      await expect(new MagicHourVideoProvider().readCreditBalance()).resolves.toMatchObject({ balance: 0, readable: false });
    });

    it('reports an unreadable balance when the endpoint is down', async () => {
      stubFetch([{ status: 500, body: { message: 'boom' } }]);
      await expect(new MagicHourVideoProvider().readCreditBalance()).resolves.toMatchObject({ readable: false });
    });

    it('spends nothing when there is no key', async () => {
      delete process.env.MAGICHOUR_API_KEY;
      await expect(new MagicHourVideoProvider().readCreditBalance()).resolves.toEqual({ balance: 0, readable: false });
      expect(calls).toHaveLength(0);
    });
  });

  describe('downloadResult', () => {
    const job = (downloads: VideoJob['downloads']): VideoJob => ({
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

    it('refuses a completed project with no download instead of storing nothing', async () => {
      await expect(new MagicHourVideoProvider().downloadResult(job([]))).rejects.toMatchObject({
        code: 'EMPTY_PROVIDER_RESPONSE',
      });
    });

    it('refuses a zero byte download', async () => {
      stubFetch([{ binary: Buffer.alloc(0) }]);
      await expect(new MagicHourVideoProvider().downloadResult(job([{ url: 'https://cdn.magichour.ai/clip.mp4', expiresAt: null }]))).rejects.toMatchObject({
        code: 'EMPTY_PROVIDER_RESPONSE',
      });
    });

    it('refuses a download that announced more than the ceiling', async () => {
      stubFetch([{ binary: Buffer.alloc(16), headers: { 'content-length': String(999 * 1024 * 1024) } }]);
      await expect(new MagicHourVideoProvider().downloadResult(job([{ url: 'https://cdn.magichour.ai/clip.mp4', expiresAt: null }]))).rejects.toMatchObject({
        code: 'PROVIDER_REQUEST_FAILED',
      });
    });

    it('returns the bytes as base64 and claims only the provider type', async () => {
      const clip = Buffer.from('A_REAL_MP4_PAYLOAD');
      stubFetch([{ binary: clip }]);
      const result = await new MagicHourVideoProvider().downloadResult(job([{ url: 'https://cdn.magichour.ai/clip.mp4', expiresAt: null }]));
      expect(Buffer.from(result.data, 'base64').equals(clip)).toBe(true);
      expect(result.mimeType).toBe('video/mp4');
    });
  });
});

describe('estimateMagicHourCredits', () => {
  it('prices a free plan render at its published per-second rate', () => {
    expect(estimateMagicHourCredits({ model: 'ltx-2.5', resolution: '480p', seconds: 4, withAudio: false })).toEqual({
      creditsPerSecond: 24,
      estimated: 96,
      audioSupported: true,
      audioSurcharge: 0,
    });
  });

  it('charges nothing extra for a silent render, rather than calling it unpriceable', () => {
    const cost = estimateMagicHourCredits({ model: 'seedance-2.0', resolution: '720p', seconds: 5, withAudio: false });
    expect(cost.audioSurcharge).toBe(0);
    expect(cost.estimated).toBe(cost.creditsPerSecond === null ? null : cost.creditsPerSecond * 5);
  });

  it('returns nulls for a combination that is not in the table, instead of guessing', () => {
    expect(estimateMagicHourCredits({ model: 'ltx-2.5', resolution: '4k', seconds: 4, withAudio: false })).toMatchObject({
      creditsPerSecond: null,
      estimated: null,
    });
  });

  it('knows which models cannot render audio at all', () => {
    expect(estimateMagicHourCredits({ model: 'wan-2.2', resolution: '720p', seconds: 4, withAudio: true }).audioSupported).toBe(false);
    expect(estimateMagicHourCredits({ model: 'ltx-2.5', resolution: '480p', seconds: 4, withAudio: true }).audioSupported).toBe(true);
  });

  it('separates the free models from the whole catalogue', () => {
    expect(isMagicHourModel('ltx-2.5')).toBe(true);
    expect(isMagicHourModel('sora-2')).toBe(true);
    expect(isMagicHourModel('gemini-3.1-flash-image')).toBe(false);
    expect(MAGIC_HOUR_FREE_MODELS).not.toContain('sora-2' as never);
  });
});
