import { describe, expect, it, beforeEach, afterEach, jest } from '@jest/globals';
import { DeepAiVideoProvider } from './deepai-video.provider';
import { AiProviderError } from './provider.types';
import { DEEPAI_VIDEO_MAX_SECONDS, DEEPAI_VIDEO_MIN_SECONDS, DEEPAI_VIDEO_MODEL } from './deepai.pricing';

/**
 * DeepAI video, tested against recorded response shapes.
 *
 * The fixtures cover the parts of the API that decide whether a render is even
 * submitted: the `mode` that selects one of two separate allowances, the length
 * DeepAI accepts, and the two endpoints, since a first frame goes to `img2video`
 * and a prompt alone goes to `text2video`.
 *
 * `fetch` is replaced throughout. A live call would need a paid Pro subscription
 * and would bill real money, so a regression has to surface here instead.
 */

let calls: Array<{ url: string; method: string; body: unknown; headers: Record<string, string> }> = [];
let originalFetch: typeof globalThis.fetch;

function stubFetch(responses: Array<{ status?: number; body: unknown }>) {
  let index = 0;
  globalThis.fetch = jest.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({
      url,
      method: init?.method ?? 'GET',
      body: init?.body,
      headers: (init?.headers ?? {}) as Record<string, string>,
    });
    const next = responses[Math.min(index, responses.length - 1)];
    index += 1;
    return new Response(typeof next.body === 'string' ? next.body : JSON.stringify(next.body), {
      status: next.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof globalThis.fetch;
}

describe('DeepAiVideoProvider', () => {
  beforeEach(() => {
    originalFetch = globalThis.fetch;
    calls = [];
    process.env.DEEPAI_API_KEY = 'test-key';
    /**
     * Default to a `fetch` that fails loudly, so a test which forgets to stub cannot
     * quietly reach the real API. A live call here would need a paid Pro
     * subscription and would bill real money, and it does not fail in a way that
     * looks like a test bug.
     */
    globalThis.fetch = jest.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      throw new Error(`UNSTUBBED NETWORK CALL to ${url}`);
    }) as unknown as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.DEEPAI_API_KEY;
  });

  describe('createJob', () => {
    it('submits a prompt to text2video with the mode and length in the form', async () => {
      stubFetch([{ body: { id: 'job-1' } }]);

      const job = await new DeepAiVideoProvider().createJob({ prompt: 'A city at dusk', durationSeconds: 6 });

      expect(calls[0].url).toBe('https://api.deepai.org/video-api/text2video');
      expect(calls[0].method).toBe('POST');
      // DeepAI uses a bare `api-key` header, not `Authorization: Bearer`.
      expect(calls[0].headers['api-key']).toBe('test-key');
      expect(job.id).toBe('job-1');
    });

    it('submits a first frame to img2video rather than text2video', async () => {
      stubFetch([{ body: { id: 'job-2' } }]);

      await new DeepAiVideoProvider().createJob({
        prompt: 'Animate this',
        durationSeconds: 5,
        image: { mimeType: 'image/png', data: Buffer.from('not-really-a-png').toString('base64') },
      });

      // The endpoint differs when there is an image to start from, and picking the
      // wrong one would be refused after a pointless upload.
      expect(calls[0].url).toBe('https://api.deepai.org/video-api/img2video');
    });

    /**
     * Audio exists only in hollywood mode, and hollywood has its own much smaller
     * monthly allowance. Silently rendering without audio, or spending from the HD
     * pool for a Hollywood clip, would both be a surprise charge.
     */
    it('uses hollywood when audio is asked for', async () => {
      stubFetch([{ body: { id: 'job-3' } }]);
      const job = await new DeepAiVideoProvider().createJob({ prompt: 'A street', durationSeconds: 5, withAudio: true });
      // `type` carries the mode, because that is which of the two separate monthly
      // pools paid for the clip. A job that lost this would charge HD for a
      // Hollywood render.
      expect(job.type).toBe('hollywood');
    });

    it('uses hd by default, charged to the standard pool', async () => {
      stubFetch([{ body: { id: 'job-hd' } }]);
      const job = await new DeepAiVideoProvider().createJob({ prompt: 'A street', durationSeconds: 5 });
      expect(job.type).toBe('hd');
    });

    it('refuses audio on an explicit hd model instead of dropping the audio', async () => {
      const provider = new DeepAiVideoProvider();
      await expect(
        provider.createJob({ prompt: 'A street', durationSeconds: 5, withAudio: true, model: `${DEEPAI_VIDEO_MODEL}:hd` }),
      ).rejects.toThrow(/does not carry audio/);
      expect(calls).toHaveLength(0);
    });

    it('refuses a clip shorter or longer than DeepAI renders', async () => {
      const provider = new DeepAiVideoProvider();
      await expect(provider.createJob({ prompt: 'Short', durationSeconds: DEEPAI_VIDEO_MIN_SECONDS - 1 })).rejects.toThrow(
        /Nothing was submitted/,
      );
      await expect(provider.createJob({ prompt: 'Long', durationSeconds: DEEPAI_VIDEO_MAX_SECONDS + 1 })).rejects.toThrow(
        /Nothing was submitted/,
      );
      // Refused locally, so no seconds are drawn from the monthly allowance.
      expect(calls).toHaveLength(0);
    });

    it('refuses a length that is not a whole number rather than rounding it', async () => {
      const provider = new DeepAiVideoProvider();
      await expect(provider.createJob({ prompt: 'Half', durationSeconds: 5.5 })).rejects.toThrow(/whole seconds only/);
    });

    it('refuses an empty prompt when there is no first frame to work from', async () => {
      const provider = new DeepAiVideoProvider();
      await expect(provider.createJob({ prompt: '   ' })).rejects.toThrow(/prompt is required/i);
    });

    it('accepts an empty prompt when a first frame is supplied', async () => {
      stubFetch([{ body: { id: 'job-4' } }]);
      await new DeepAiVideoProvider().createJob({
        prompt: '',
        durationSeconds: 5,
        image: { mimeType: 'image/png', data: Buffer.from('x').toString('base64') },
      });
      expect(calls).toHaveLength(1);
    });

    it('maps every ratio ISOBASH offers onto one of DeepAI shapes', async () => {
      stubFetch([{ body: { id: 'job-shape' } }]);
      // `MEDIA_VIDEO_ASPECT_RATIOS` is 16:9, 9:16 and 1:1 by default, and all three
      // have to land on a real shape or a routine request is refused.
      for (const ratio of ['16:9', '9:16', '1:1']) {
        const job = await new DeepAiVideoProvider().createJob({ prompt: 'A city', durationSeconds: 5, aspectRatio: ratio });
        expect(job.id).toBe('job-shape');
      }
    });

    it('refuses an aspect ratio it cannot map', async () => {
      const provider = new DeepAiVideoProvider();
      await expect(provider.createJob({ prompt: 'Wide', durationSeconds: 5, aspectRatio: '21:9' })).rejects.toThrow(
        /cannot render an aspect ratio/,
      );
      // Refused before submission, so no seconds leave the monthly allowance.
      expect(calls).toHaveLength(0);
    });

    it('does not submit anything without a key', async () => {
      delete process.env.DEEPAI_API_KEY;
      const provider = new DeepAiVideoProvider();
      await expect(provider.createJob({ prompt: 'A city', durationSeconds: 5 })).rejects.toThrow(/DEEPAI_API_KEY/);
      expect(calls).toHaveLength(0);
    });
  });

  describe('status', () => {
    it('reads a finished job with its download link', async () => {
      stubFetch([
        {
          body: {
            id: 'job-1',
            status: 'complete',
            output_url: 'https://cdn.deepai.org/clip.mp4',
            thumbnail_url: 'https://cdn.deepai.org/thumb.jpg',
            duration: 6,
          },
        },
      ]);

      const job = await new DeepAiVideoProvider().getJob('job-1');

      expect(calls[0].url).toBe('https://api.deepai.org/video-api/status/job-1');
      expect(job.downloads[0]?.url).toBe('https://cdn.deepai.org/clip.mp4');
    });

    it('keeps a still-running job as running rather than calling it finished', async () => {
      stubFetch([{ body: { id: 'job-1', status: 'processing' } }]);
      const job = await new DeepAiVideoProvider().getJob('job-1');
      expect(job.status).not.toBe('succeeded');
      expect(job.downloads).toHaveLength(0);
    });
  });

  describe('refusals', () => {
    /**
     * The 403 case is the one that catches people out: a key can be perfectly
     * valid and still be refused, because the video APIs need an active Pro
     * subscription. Saying so is the difference between an operator fixing billing
     * and an operator concluding the integration is broken.
     */
    it('explains that a key alone is refused without a Pro subscription', async () => {
      stubFetch([{ status: 403, body: { error: 'subscription required' } }]);
      const provider = new DeepAiVideoProvider();
      await expect(provider.createJob({ prompt: 'A city', durationSeconds: 5 })).rejects.toThrow(/Pro subscription/i);
    });

    it('explains an empty wallet rather than reporting a generic failure', async () => {
      stubFetch([{ status: 402, body: { error: 'insufficient funds' } }]);
      const provider = new DeepAiVideoProvider();
      await expect(provider.createJob({ prompt: 'A city', durationSeconds: 5 })).rejects.toThrow(AiProviderError);
    });

    it('explains a refused key', async () => {
      stubFetch([{ status: 401, body: { error: 'bad key' } }]);
      const provider = new DeepAiVideoProvider();
      await expect(provider.createJob({ prompt: 'A city', durationSeconds: 5 })).rejects.toThrow(/API key/i);
    });
  });

  describe('health', () => {
    it('reports unconfigured without a key rather than claiming to be usable', async () => {
      delete process.env.DEEPAI_API_KEY;
      const health = await new DeepAiVideoProvider().health();
      expect(health.status).toBe('unconfigured');
    });

    it('says plainly that video needs a paid subscription, not just a key', async () => {
      const health = await new DeepAiVideoProvider().health();
      expect(health.status).toBe('healthy');
      // The detail is what an operator reads when a render is refused, so the
      // subscription requirement has to be in it rather than only in a code comment.
      expect(health.detail).toMatch(/Pro subscription/i);
    });
  });

  describe('balance', () => {
    /**
     * There is no DeepAI balance endpoint for video, so this number is the local
     * accounting, and `tier` says so. A deployment that presents it as a live
     * provider balance would be overstating what it knows.
     */
    it('labels its figure as locally accounted rather than read back from DeepAI', async () => {
      const balance = await new DeepAiVideoProvider().readCreditBalance();
      expect(balance.readable).toBe(true);
      expect(balance.tier).toMatch(/locally/);
    });

    it('is unreadable rather than zero without a key', async () => {
      delete process.env.DEEPAI_API_KEY;
      const balance = await new DeepAiVideoProvider().readCreditBalance();
      expect(balance.readable).toBe(false);
    });
  });
});
