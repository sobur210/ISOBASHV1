import { describe, expect, it, beforeEach, afterEach, jest } from '@jest/globals';
import { Json2VideoProvider } from './json2video.provider';
import { ASSEMBLY_FREE_MAX_SECONDS, ASSEMBLY_RESOLUTIONS } from './video-assembly.types';
import { AiProviderError } from './provider.types';

/**
 * JSON2Video assembly, tested against recorded response shapes.
 *
 * The fixtures are the parts of the API this feature actually depends on: the
 * `project` id that identifies a movie, the `movie` object that carries its status,
 * the `remaining_quota` block that is the only balance this provider reports, and
 * the expiry of a finished movie's `url`.
 *
 * No key and no network: `fetch` is replaced, so a regression shows up here rather
 * than as a real 600-credit charge.
 */

const MOVIE_ID = 'a1b2c3d4e5f6a7b8';

type Call = { url: string; method: string; body: BodyInit | null | undefined; headers: Record<string, string> };

let calls: Call[] = [];
let originalFetch: typeof globalThis.fetch;

/** Answer each request from a queue of fixtures, recording what was asked. */
function stubFetch(responses: Array<{ status?: number; body: unknown }>) {
  let index = 0;
  globalThis.fetch = jest.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({
      url,
      method: init?.method ?? 'GET',
      body: init?.body as BodyInit | null | undefined,
      headers: (init?.headers ?? {}) as Record<string, string>,
    });
    const next = responses[Math.min(index, responses.length - 1)];
    index += 1;
    const text = typeof next.body === 'string' ? next.body : JSON.stringify(next.body);
    return new Response(next.status && next.status >= 400 ? text : text, {
      status: next.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof globalThis.fetch;
}

describe('Json2VideoProvider', () => {
  beforeEach(() => {
    originalFetch = globalThis.fetch;
    calls = [];
    process.env.JSON2VIDEO_API_KEY = 'test-key';
    process.env.JSON2VIDEO_POLL_INTERVAL_MS = '1';
    /**
     * Default to a `fetch` that fails loudly, so a test that forgets to stub cannot
     * quietly reach the real API. A live call would spend part of a 600-credit
     * grant that does not renew, and would not fail in a way that looks like a bug
     * in the test.
     */
    globalThis.fetch = jest.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      throw new Error(`UNSTUBBED NETWORK CALL to ${url}`);
    }) as unknown as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.JSON2VIDEO_API_KEY;
    delete process.env.JSON2VIDEO_POLL_INTERVAL_MS;
  });

  describe('buildRecipe', () => {
    it('lays a report out as a title card then one scene per section', () => {
      const recipe = new Json2VideoProvider().buildRecipe({
        title: 'Quarterly findings',
        scenes: [
          { heading: 'Revenue', body: 'Revenue grew across every region.' },
          { heading: 'Costs', body: 'Costs rose slower than revenue.' },
        ],
        voiceover: false,
        resolution: 'hd',
        source: 'research',
      });

      const scenes = recipe.scenes as Array<{ elements: Array<{ type: string; text: string }> }>;
      // Title card, one scene per section, no voice, no outro.
      expect(scenes).toHaveLength(3);
      expect(scenes[0].elements[0].text).toBe('Quarterly findings');
      expect(scenes[1].elements.map((e) => e.text)).toEqual(['Revenue', 'Revenue grew across every region.']);
      expect(scenes.map((s) => s.elements.every((e) => e.type === 'text'))).toEqual([true, true, true]);
    });

    it('drops an empty section rather than submitting a scene with nothing in it', () => {
      const recipe = new Json2VideoProvider().buildRecipe({
        title: 'Report',
        scenes: [
          { heading: 'Real', body: 'Actual content.' },
          { heading: '   ', body: '  ' },
        ],
        voiceover: false,
        resolution: 'hd',
        source: 'research',
      });
      // Title card plus the one real section; the blank one is not submitted,
      // because JSON2Video rejects a scene that has nothing to render.
      expect(recipe.scenes).toHaveLength(2);
    });

    it('narration is one voice element for the whole script, not one per scene', () => {
      const recipe = new Json2VideoProvider().buildRecipe({
        title: 'Findings',
        scenes: [{ heading: 'A', body: 'First point.' }],
        voiceover: true,
        resolution: 'hd',
        source: 'chat',
      });

      const scenes = recipe.scenes as Array<{ elements: Array<{ type: string; duration: number; text?: string }> }>;
      const voices = scenes.flatMap((s) => s.elements.filter((e) => e.type === 'voice'));
      // One voice covering the whole script. A voice element per scene would be
      // spoken in scene order anyway, and `duration: -1` is what tells JSON2Video
      // to size the movie from the narration instead of a guessed length.
      expect(voices).toHaveLength(1);
      expect(voices[0].duration).toBe(-1);
      expect(voices[0].text).toContain('First point.');
    });

    it('records where the content came from so the video is traceable', () => {
      const recipe = new Json2VideoProvider().buildRecipe({
        title: 'Summary',
        scenes: [{ heading: 'A', body: 'Body.' }],
        voiceover: false,
        resolution: 'hd',
        source: 'chat',
        sourceId: 'conv-42',
      });
      expect(recipe['client-data']).toMatchObject({ source: 'chat', sourceId: 'conv-42' });
    });
  });

  describe('submit', () => {
    it('sends the recipe to /v2/movies and keeps the project id', async () => {
      stubFetch([{ body: { project: MOVIE_ID } }]);
      const provider = new Json2VideoProvider();

      const result = await provider.submit({
        title: 'Findings',
        scenes: [{ heading: 'A', body: 'Body.' }],
        voiceover: false,
        resolution: 'hd',
        source: 'research',
      });

      expect(result.job.id).toBe(MOVIE_ID);
      expect(calls[0].url).toBe('https://api.json2video.com/v2/movies');
      expect(calls[0].method).toBe('POST');
      // Auth is a bare `x-api-key`, not a bearer token.
      expect(calls[0].headers['x-api-key']).toBe('test-key');
    });

    /**
     * The id has to survive a poll, or a run is submitted once and then tracked
     * against no project at all. This is the case the original `toJob` missed: the
     * create response puts `project` at the top level while the status response
     * nests it under `movie`, so reading only one of the two loses it.
     */
    it('keeps the project id when polling status', async () => {
      stubFetch([{ body: { movie: { project: MOVIE_ID, status: 'running' } } }]);
      const provider = new Json2VideoProvider();

      const job = await provider.getJob(MOVIE_ID);

      expect(job.id).toBe(MOVIE_ID);
      expect(calls[0].url).toContain(`project=${MOVIE_ID}`);
    });

    it('refuses a resolution the plan does not include', async () => {
      const provider = new Json2VideoProvider();
      await expect(
        provider.submit({
          title: 'Findings',
          scenes: [{ heading: 'A', body: 'Body.' }],
          voiceover: false,
          // 4k is not in ASSEMBLY_RESOLUTIONS, and the free plan caps at 1080p.
          resolution: '4k' as (typeof ASSEMBLY_RESOLUTIONS)[number],
          source: 'research',
        }),
      ).rejects.toThrow(AiProviderError);
      // Refused locally, before anything was submitted and before any credit moved.
      expect(calls).toHaveLength(0);
    });

    it('refuses an empty title without contacting the provider', async () => {
      stubFetch([{ body: {} }]);
      const provider = new Json2VideoProvider();
      await expect(
        provider.submit({ title: '   ', scenes: [{ heading: 'A', body: 'B' }], voiceover: false, resolution: 'hd', source: 'research' }),
      ).rejects.toThrow(/needs a title/);
      expect(calls).toHaveLength(0);
    });

    it('fails loudly when the provider accepts the movie but returns no id', async () => {
      stubFetch([{ body: { message: 'ok' } }]);
      const provider = new Json2VideoProvider();
      await expect(
        provider.submit({ title: 'Findings', scenes: [{ heading: 'A', body: 'B' }], voiceover: false, resolution: 'hd', source: 'research' }),
      ).rejects.toThrow(/no project id/);
    });
  });

  describe('status handling', () => {
    it('reads a finished movie with its size and remaining quota', async () => {
      stubFetch([
        {
          body: {
            movie: {
              project: MOVIE_ID,
              status: 'done',
              url: 'https://cdn.example/movie.mp4',
              thumbnail: 'https://cdn.example/thumb.png',
              duration: 42,
              width: 1920,
              height: 1080,
              size: 4_200_000,
            },
            remaining_quota: { time: 558 },
          },
        },
      ]);

      const job = await new Json2VideoProvider().getJob(MOVIE_ID);

      expect(job.status).toBe('done');
      expect(job.url).toBe('https://cdn.example/movie.mp4');
      expect(job.durationSeconds).toBe(42);
      expect(job.width).toBe(1920);
      // 600 free credits less the 42 just rendered.
      expect(job.remainingQuotaSeconds).toBe(558);
    });

    /**
     * A failure reported with an unrecognised status is a failure, not an unknown
     * one. Reporting it as unknown leaves a run spinning until the client gives up,
     * which reads to the user as a hang rather than as the provider's own error.
     */
    it('treats success:false as an error even when the status is unrecognised', async () => {
      stubFetch([{ body: { movie: { project: MOVIE_ID, status: 'weird', success: false, message: 'scene 2 had no text' } } }]);

      const job = await new Json2VideoProvider().getJob(MOVIE_ID);

      expect(job.status).toBe('error');
      // The provider's reason is kept verbatim rather than rewritten.
      expect(job.message).toBe('scene 2 had no text');
    });

    it('keeps the provider reason on an error', async () => {
      stubFetch([{ body: { movie: { project: MOVIE_ID, status: 'error', message: 'voice model unavailable' } } }]);
      const job = await new Json2VideoProvider().getJob(MOVIE_ID);
      expect(job.status).toBe('error');
      expect(job.message).toBe('voice model unavailable');
    });

    it('reports the quota as unread rather than zero when the provider omits it', async () => {
      stubFetch([{ body: { movie: { project: MOVIE_ID, status: 'running' } } }]);
      const job = await new Json2VideoProvider().getJob(MOVIE_ID);
      // Null, not 0: "not reported" and "no time left" are different facts, and only
      // the second one should stop a render.
      expect(job.remainingQuotaSeconds).toBeNull();
    });
  });

  describe('readCreditBalance', () => {
    it('reports whole seconds left as a readable balance', async () => {
      stubFetch([{ body: { remaining_quota: { time: 597.7 } } }]);
      const balance = await new Json2VideoProvider().readCreditBalance();
      expect(balance).toMatchObject({ balance: 597, readable: true });
    });

    it('is unreadable rather than zero when the quota block is missing', async () => {
      stubFetch([{ body: { movies: [] } }]);
      const balance = await new Json2VideoProvider().readCreditBalance();
      // A false zero would render the feature dead for a reason the user cannot act
      // on, when the truth is that the endpoint did not answer.
      expect(balance.readable).toBe(false);
    });

    it('is unreadable rather than zero when the request fails outright', async () => {
      stubFetch([{ status: 500, body: { message: 'upstream' } }]);
      const balance = await new Json2VideoProvider().readCreditBalance();
      expect(balance.readable).toBe(false);
    });
  });

  describe('errors', () => {
    it('explains a refused key rather than leaking the response body', async () => {
      stubFetch([{ status: 401, body: { message: 'Invalid API key' } }]);
      const provider = new Json2VideoProvider();
      await expect(
        provider.submit({ title: 'Findings', scenes: [{ heading: 'A', body: 'B' }], voiceover: false, resolution: 'hd', source: 'research' }),
      ).rejects.toThrow(/API key/);
    });

    it('does not submit at all without a key', async () => {
      delete process.env.JSON2VIDEO_API_KEY;
      const provider = new Json2VideoProvider();
      await expect(
        provider.submit({ title: 'Findings', scenes: [{ heading: 'A', body: 'B' }], voiceover: false, resolution: 'hd', source: 'research' }),
      ).rejects.toThrow(/JSON2VIDEO_API_KEY/);
      expect(calls).toHaveLength(0);
    });
  });

  describe('plan limits', () => {
    it('caps a single movie at the free plan length', () => {
      const provider = new Json2VideoProvider();
      expect(provider.maxSeconds).toBe(ASSEMBLY_FREE_MAX_SECONDS);
      // 1080p is the ceiling, so anything larger is not offered at all.
      expect([...provider.resolutions]).toEqual([...ASSEMBLY_RESOLUTIONS]);
    });

    it('reports unconfigured without a key, rather than claiming to be healthy', async () => {
      delete process.env.JSON2VIDEO_API_KEY;
      const health = await new Json2VideoProvider().health();
      expect(health.status).toBe('unconfigured');
    });
  });
});
