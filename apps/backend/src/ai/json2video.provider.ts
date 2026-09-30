import { Injectable } from '@nestjs/common';
import { AiProviderError } from './provider.types';
import { ProviderCreditBalance } from './video-provider.types';
import {
  ASSEMBLY_FREE_MAX_SECONDS,
  ASSEMBLY_MAX_BODY_BYTES,
  ASSEMBLY_RESOLUTIONS,
  AssembleVideoRequest,
  AssemblyResolution,
  AssemblyResult,
  AssemblyScene,
  VideoAssemblyJob,
  VideoAssemblyStatus,
  VideoAssemblyProvider,
} from './video-assembly.types';

const DEFAULT_BASE_URL = 'https://api.json2video.com';
const POLL_INTERVAL_MS = Number(process.env.JSON2VIDEO_POLL_INTERVAL_MS || 7_000);
/** Generous: the docs say rendering runs for minutes, and a 60s movie is the cap. */
const RENDER_TIMEOUT_MS = Number(process.env.JSON2VIDEO_TIMEOUT_MS || 900_000);
const DOWNLOAD_TIMEOUT_MS = Number(process.env.JSON2VIDEO_DOWNLOAD_TIMEOUT_MS || 120_000);
const MAX_DOWNLOAD_BYTES = Number(process.env.JSON2VIDEO_MAX_BYTES || 200 * 1024 * 1024);

/** Statuses after which JSON2Video will not change its mind. */
const TERMINAL = new Set<VideoAssemblyStatus>(['done', 'error', 'timeout']);

/**
 * JSON2Video free plan, from the published docs.
 *
 *   https://json2video.com/docs/v2/reference/credits/plans
 *   https://json2video.com/docs/v2/reference/credits/credit-consumption
 *   https://json2video.com/docs/v2/reference/credits/limits
 *
 *  - 600 credits on signup. NON-RENEWABLE: they do not come back next month, so a
 *    free account renders a finite total over its lifetime, not a monthly budget.
 *  - 1 credit per second of output, at any resolution from SD to 4K. Resolution does
 *    not change the rate. (A 4K FAQ example prices at 4 credits/second, which
 *    contradicts the consumption table; the table is the one the docs point at as
 *    authoritative, and 4K is not reachable on the free plan anyway.)
 *  - Text-to-speech voiceovers currently cost 0 credits on every plan, so a narrated
 *    video is billed for rendering only.
 *  - Max 1080p and max 60 seconds for a single movie.
 *  - Output is watermarked on the free plan, and the plan is for personal,
 *    educational and evaluation use -- explicitly not commercial.
 *  - Failed renders are not billed.
 *
 * So 600 credits is 600 seconds of finished video, once, ever, for this account.
 * The most useful first use is a short narrated summary: a title card, four or five
 * text scenes and an outro runs about 30-40 seconds and costs about 30-40 credits,
 * which leaves the rest of the grant for real tests.
 */
const FREE_PLAN_CREDITS = 600;

/** Marks a scene the assembler generated, so provenance is visible in the recipe. */
const SCENE_COMMENT_PREFIX = 'isobash:';

@Injectable()
export class Json2VideoProvider implements VideoAssemblyProvider {
  readonly name = 'json2video';
  readonly resolutions: readonly AssemblyResolution[] = ASSEMBLY_RESOLUTIONS;

  /**
   * The free plan's 60 second cap.
   *
   * Read from the environment so a paid plan can raise it, but the default is the
   * free ceiling and the assembler will not build a longer movie than this.
   */
  readonly maxSeconds = Number(process.env.JSON2VIDEO_MAX_SECONDS || ASSEMBLY_FREE_MAX_SECONDS);

  private readonly baseUrl = (process.env.JSON2VIDEO_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');

  private get apiKey(): string | undefined {
    return process.env.JSON2VIDEO_API_KEY || undefined;
  }

  async health(): Promise<{ provider: string; status: 'healthy' | 'unconfigured' | 'degraded'; detail: string }> {
    if (!this.apiKey) {
      return {
        provider: this.name,
        status: 'unconfigured',
        detail: 'JSON2VIDEO_API_KEY is not configured, so no video can be assembled.',
      };
    }
    return {
      provider: this.name,
      status: 'healthy',
      detail:
        `Video assembly through JSON2Video (free plan: ${FREE_PLAN_CREDITS} non-renewable credits, ` +
        `1 credit per second of output, so ${FREE_PLAN_CREDITS} seconds of finished video in total and not again next month; ` +
        `text-to-speech voiceovers currently cost 0 credits). Output is watermarked and capped at ` +
        `${this.resolutions[this.resolutions.length - 1]} and ${this.maxSeconds}s per movie.`,
    };
  }

  /**
   * Turn a report or summary into a slideshow recipe.
   *
   * The shape is deliberately simple and legible: a title card, one scene per
   * section, an outro. No template, no animation library, no `component` elements.
   * The point of this feature is that a long piece of research becomes a watchable
   * clip, and a recipe full of JSON2Video-specific styling would be unreviewable
   * and unfixable from ISOBASH's side.
   *
   * Every scene carries a `comment` naming its source section, so a rendered
   * video can be traced back to the text it came from. JSON2Video ignores `comment`
   * when rendering; it is documentation, carried in the stored recipe.
   */
  buildRecipe(request: AssembleVideoRequest): Record<string, unknown> {
    const scenes: AssemblyScene[] = [];

    scenes.push({
      elements: [
        { type: 'text', text: request.title, duration: titleCardSeconds(request.title) },
        ...(request.subtitle ? [{ type: 'text' as const, text: request.subtitle, duration: 3 }] : []),
      ],
    });

    for (const section of request.scenes) {
      const heading = section.heading.trim();
      const body = section.body.trim();
      if (!heading && !body) continue;
      scenes.push({
        elements: [
          { type: 'text', text: heading || request.title, duration: 3 },
          { type: 'text', text: body, duration: narrationSeconds(body) },
        ],
      });
    }

    if (request.voiceover) {
      /**
       * One voice element for the whole movie rather than one per scene.
       *
       * A voice element with a fixed `duration` is narration that does not match
       * the text it reads, which is exactly the kind of "narrated" video that
       * sounds broken. JSON2Video sizes a voice element from its own text
       * (`duration: -1`), so the whole script is spoken once, in order, and the
       * movie takes the length of the narration.
       */
      const script = [request.title, request.subtitle ?? '', ...request.scenes.map((s) => `${s.heading}. ${s.body}`), request.outro ?? '']
        .map((part) => part.trim())
        .filter(Boolean)
        .join('. ');
      scenes.push({ elements: [{ type: 'voice', text: script, duration: -1 }] });
    }

    if (request.outro) {
      scenes.push({ elements: [{ type: 'text', text: request.outro, duration: 4 }] });
    }

    return {
      resolution: request.resolution,
      scenes,
      // The recipe is echoed back in the status response, so keeping it small
      // keeps every poll cheap.
      cache: true,
      'client-data': {
        source: request.source,
        ...(request.sourceId ? { sourceId: request.sourceId } : {}),
        note: `${SCENE_COMMENT_PREFIX} assembled by ISOBASH from a ${request.source} piece`,
      },
    };
  }

  async submit(request: AssembleVideoRequest): Promise<AssemblyResult> {
    const key = this.requireKey();
    if (!request.title.trim()) {
      throw new AiProviderError('An assembled video needs a title.', this.name, 'INVALID_REQUEST');
    }
    if (!this.resolutions.includes(request.resolution)) {
      throw new AiProviderError(
        `JSON2Video cannot render at "${request.resolution}". Allowed here: ${this.resolutions.join(', ')}.`,
        this.name,
        'INVALID_REQUEST',
      );
    }

    const recipe = this.buildRecipe(request);
    const body = JSON.stringify(recipe);
    if (Buffer.byteLength(body, 'utf8') > ASSEMBLY_MAX_BODY_BYTES) {
      throw new AiProviderError(
        `The recipe is ${Buffer.byteLength(body, 'utf8')} bytes and JSON2Video refuses a body over ${ASSEMBLY_MAX_BODY_BYTES}. ` +
          `Shorten the source text or split it into two videos.`,
        this.name,
        'INVALID_REQUEST',
      );
    }

    const payload = (await this.requestJson('POST', '/v2/movies', key, body, 60_000)) as Record<string, unknown>;
    const id = typeof payload.project === 'string' ? payload.project : '';
    if (!id) {
      throw new AiProviderError('JSON2Video accepted the movie but returned no project id.', this.name, 'EMPTY_PROVIDER_RESPONSE');
    }
    // A freshly submitted movie has not been polled yet, so its status is genuinely
    // unknown rather than assumed `pending`.
    const job: VideoAssemblyJob = { ...this.toJob({}), id, status: 'unknown' };
    return {
      provider: this.name,
      job,
      recipe,
      // 1 credit per second of output, and the length is only known once rendered.
      creditsCharged: null,
      creditsChargedIsEstimate: true,
    };
  }

  async getJob(id: string): Promise<VideoAssemblyJob> {
    const key = this.requireKey();
    const payload = (await this.requestJson('GET', `/v2/movies?project=${encodeURIComponent(id)}&format=simple`, key, undefined, 30_000)) as Record<
      string,
      unknown
    >;
    const movie = (payload.movie ?? {}) as Record<string, unknown>;
    if (Object.keys(movie).length === 0) {
      throw new AiProviderError(
        `JSON2Video returned no movie for project ${id}. A project that cannot be found comes back this way, ` +
          `not as a 404, so the id may be wrong or the movie may have been deleted.`,
        this.name,
        'MODEL_NOT_AVAILABLE',
      );
    }
    return this.toJob(payload);
  }

  /**
   * Poll until the movie is `done`, `error` or `timeout`.
   *
   * `timeout` is listed as a client-side status: the docs say the server keeps
   * `running` internally past 15 minutes and instruct clients to treat `timeout` as
   * fatal. It is handled as a failure here rather than waited out.
   */
  async waitForCompletion(initial: VideoAssemblyJob, signal?: AbortSignal): Promise<VideoAssemblyJob> {
    const deadline = Date.now() + RENDER_TIMEOUT_MS;
    let job = initial;
    while (!TERMINAL.has(job.status)) {
      if (Date.now() >= deadline) {
        throw new AiProviderError(
          `JSON2Video had not finished project ${job.id} after ${RENDER_TIMEOUT_MS}ms (last status ${job.status}). ` +
            `The project id is kept so its final state can be checked; the render may still finish.`,
          this.name,
          'PROVIDER_TIMEOUT',
        );
      }
      if (signal?.aborted) {
        throw new AiProviderError('The assembly was cancelled while waiting for JSON2Video.', this.name, 'PROVIDER_TIMEOUT');
      }
      await sleep(Math.min(POLL_INTERVAL_MS, Math.max(0, deadline - Date.now())), signal);
      job = await this.getJob(job.id);
    }
    if (job.status !== 'done') {
      throw new AiProviderError(
        `JSON2Video could not assemble project ${job.id}: ${job.message ?? 'no reason given'}.`,
        this.name,
        'PROVIDER_REQUEST_FAILED',
      );
    }
    return job;
  }

  async downloadResult(job: VideoAssemblyJob): Promise<{ mimeType: string; data: string }> {
    if (!job.url) {
      throw new AiProviderError(
        `JSON2Video reported project ${job.id} as ${job.status} but returned no video URL. Nothing was stored.`,
        this.name,
        'EMPTY_PROVIDER_RESPONSE',
      );
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(job.url, {
        signal: controller.signal,
        headers: { accept: 'video/mp4,video/*;q=0.9', 'user-agent': 'isobash/16 (json2video assembly)' },
      });
    } catch (error) {
      throw new AiProviderError(
        error instanceof Error && error.name === 'AbortError'
          ? `The assembled video did not download within ${DOWNLOAD_TIMEOUT_MS}ms.`
          : `The assembled video could not be downloaded: ${error instanceof Error ? error.message : 'unknown error'}.`,
        this.name,
        error instanceof Error && error.name === 'AbortError' ? 'PROVIDER_TIMEOUT' : 'PROVIDER_UNAVAILABLE',
      );
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) {
      throw new AiProviderError(
        `JSON2Video's video link answered HTTP ${response.status}. The link is a CDN URL, so a movie not fetched promptly ` +
          `may be unreachable.`,
        this.name,
        'PROVIDER_UNAVAILABLE',
      );
    }
    const declaredLength = Number(response.headers.get('content-length') ?? '');
    if (Number.isFinite(declaredLength) && declaredLength > MAX_DOWNLOAD_BYTES) {
      throw new AiProviderError(
        `The assembled video announced ${declaredLength} bytes, over the ${MAX_DOWNLOAD_BYTES} byte ceiling.`,
        this.name,
        'PROVIDER_REQUEST_FAILED',
      );
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength === 0) {
      throw new AiProviderError('JSON2Video produced a zero byte download. Nothing was stored.', this.name, 'EMPTY_PROVIDER_RESPONSE');
    }
    if (bytes.byteLength > MAX_DOWNLOAD_BYTES) {
      throw new AiProviderError(
        `The assembled video was ${bytes.byteLength} bytes, over the ${MAX_DOWNLOAD_BYTES} byte ceiling.`,
        this.name,
        'PROVIDER_REQUEST_FAILED',
      );
    }
    return { mimeType: 'video/mp4', data: bytes.toString('base64') };
  }

  /**
   * Whole seconds left on the account, read from `remaining_quota.time`.
   *
   * This is the only honest number JSON2Video offers about the account, and it is
   * in seconds rather than credits -- which is the point: the free grant is 600
   * credits at 1 credit/second, so the two are numerically equal today, and the
   * seconds figure stays correct if the per-second rate ever changes.
   *
   * `readable: false` when the field is absent, which stops spending rather than
   * assuming a full pool.
   */
  async readCreditBalance(): Promise<ProviderCreditBalance> {
    const key = this.apiKey;
    if (!key) return { balance: 0, readable: false };
    try {
      // A single-project read is the cheapest call that still carries the quota.
      const payload = (await this.requestJson('GET', '/v2/movies?limit=1&format=simple', key, undefined, 20_000)) as {
        remaining_quota?: { time?: unknown };
      };
      const seconds = payload?.remaining_quota?.time;
      if (typeof seconds !== 'number' || !Number.isFinite(seconds)) {
        return { balance: 0, readable: false, tier: 'free' };
      }
      return { balance: Math.max(0, Math.floor(seconds)), readable: true, tier: 'free' };
    } catch {
      return { balance: 0, readable: false };
    }
  }

  /** Submit, poll, download -- the one call a caller needs. */
  async assemble(request: AssembleVideoRequest): Promise<{ job: VideoAssemblyJob; recipe: Record<string, unknown>; video: { mimeType: string; data: string } }> {
    const submitted = await this.submit(request);
    const finished = await this.waitForCompletion(submitted.job, request.signal);
    const video = await this.downloadResult(finished);
    return { job: finished, recipe: submitted.recipe, video };
  }

  private toJob(payload: Record<string, unknown>): VideoAssemblyJob {
    const movie = (payload.movie ?? {}) as Record<string, unknown>;
    const quota = (payload.remaining_quota ?? {}) as { time?: unknown };
    const success = movie.success;
    const status = normaliseStatus(movie.status, success);
    return {
      id: typeof movie.project === 'string' ? movie.project : '',
      status,
      url: typeof movie.url === 'string' ? movie.url : null,
      thumbnailUrl: typeof movie.thumbnail === 'string' ? movie.thumbnail : null,
      durationSeconds: numberOrNull(movie.duration),
      width: numberOrNull(movie.width),
      height: numberOrNull(movie.height),
      sizeBytes: numberOrNull(movie.size),
      message: typeof movie.message === 'string' && movie.message ? movie.message : null,
      remainingQuotaSeconds: typeof quota.time === 'number' && Number.isFinite(quota.time) ? quota.time : null,
    };
  }

  private requireKey(): string {
    const key = this.apiKey;
    if (!key) {
      throw new AiProviderError('JSON2VIDEO_API_KEY is not configured, so no video can be assembled.', this.name, 'PROVIDER_NOT_CONFIGURED');
    }
    return key;
  }

  private async requestJson(
    method: 'GET' | 'POST',
    path: string,
    key: string,
    body: string | undefined,
    timeoutMs: number,
  ): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method,
        signal: controller.signal,
        headers: {
          accept: 'application/json',
          'x-api-key': key,
          'user-agent': 'isobash/16 (json2video assembly)',
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body }),
      });
    } catch (error) {
      throw new AiProviderError(
        error instanceof Error && error.name === 'AbortError'
          ? `JSON2Video did not answer ${method} ${path} within ${timeoutMs}ms.`
          : `JSON2Video is unreachable from this server: ${error instanceof Error ? error.message : 'unknown error'}.`,
        this.name,
        error instanceof Error && error.name === 'AbortError' ? 'PROVIDER_TIMEOUT' : 'PROVIDER_UNAVAILABLE',
      );
    } finally {
      clearTimeout(timer);
    }
    const text = await response.text().catch(() => '');
    if (!response.ok) {
      throw new AiProviderError(classifyError(response.status, text), this.name, codeFor(response.status, text));
    }
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      throw new AiProviderError('JSON2Video returned a body that is not JSON.', this.name, 'EMPTY_PROVIDER_RESPONSE');
    }
  }
}

/** A title card needs long enough to read the longest word in it, roughly. */
function titleCardSeconds(title: string): number {
  return Math.min(8, Math.max(3, Math.round(title.length / 18) + 2));
}

/**
 * Rough on-screen time for a text scene, at a comfortable reading rate.
 *
 * A slideshow scene nobody can read is worse than a shorter one: the estimate only
 * has to be close, because the total movie length is what the 60 second plan cap is
 * checked against.
 */
function narrationSeconds(body: string): number {
  return Math.min(12, Math.max(4, Math.round(body.length / 14) + 2));
}

function normaliseStatus(value: unknown, success: unknown): VideoAssemblyStatus {
  switch (value) {
    case 'pending':
    case 'running':
    case 'done':
    case 'timeout':
      return value;
    case 'error':
      return 'error';
    default:
      // `success: false` with an unrecognised status is a failure, not an unknown
      // one: reporting it as unknown would leave a run spinning until it times out.
      return success === false ? 'error' : 'unknown';
  }
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
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

function summarize(body: string): string {
  try {
    const parsed = JSON.parse(body) as { message?: unknown; code?: unknown };
    const message = parsed?.message ?? parsed?.code;
    if (typeof message === 'string') return message.slice(0, 300);
  } catch {
    /* fall through to the raw slice */
  }
  return body.slice(0, 300).replace(/\s+/g, ' ');
}

function codeFor(status: number, body: string): string {
  if (/\binsufficient credits\b/i.test(body)) return 'PROVIDER_INSUFFICIENT_CREDITS';
  if (/\bexceeded the quota\b/i.test(body)) return 'PROVIDER_INSUFFICIENT_CREDITS';
  switch (status) {
    case 400:
      return 'PROVIDER_REQUEST_FAILED';
    case 401:
    case 403:
      return 'INVALID_API_KEY';
    case 404:
      return 'MODEL_NOT_AVAILABLE';
    case 413:
      return 'PROVIDER_REQUEST_FAILED';
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

function classifyError(status: number, body: string): string {
  const detail = summarize(body);
  if (/\binsufficient credits\b/i.test(body)) {
    return (
      `JSON2Video has no credits left on this account. ${detail} `.trim() +
      `The free plan's credits do not refill, so video assembly stays unavailable until the account is topped up.`
    );
  }
  switch (status) {
    case 400:
      return `JSON2Video rejected the recipe. ${detail}`.trim();
    case 401:
      // The docs use 401 for both a bad key and an exhausted movie quota, so the
      // body is the only thing that can tell them apart.
      return /exceeded the quota/i.test(body)
        ? `JSON2Video refused this render: the movie quota on this plan is used up. ${detail}`.trim()
        : `JSON2Video refused the API key (HTTP 401). ${detail}`.trim();
    case 403:
      return `JSON2Video refused this account (HTTP 403). ${detail}`.trim();
    case 404:
      return `JSON2Video does not know this project or template. ${detail}`.trim();
    case 413:
      return `The recipe is too large for JSON2Video (HTTP 413). ${detail}`.trim();
    case 429:
      return `JSON2Video is rate limiting this key. ${detail}`.trim();
    case 500:
    case 502:
      return `JSON2Video reported a server error (HTTP ${status}). ${detail} Nothing was charged.`.trim();
    case 503:
      return `JSON2Video is temporarily unavailable. ${detail}`.trim();
    default:
      return `JSON2Video returned HTTP ${status}. ${detail}`.trim();
  }
}
