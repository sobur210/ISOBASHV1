import { Injectable } from '@nestjs/common';
import {
  AiCapability,
  AiProvider,
  AiProviderError,
  AiProviderHealth,
  AiRequest,
  AiResponse,
  AiGeneratedVideo,
  AiVideoRequest,
  AiVideoResponse,
} from './provider.types';

const DEFAULT_BASE_URL = 'https://gen.pollinations.ai';
const DEFAULT_MODEL = 'google/veo-3.1-fast';
/**
 * A clip takes minutes to render, not seconds. This is deliberately far above the
 * image adapter's wait: a render that has not answered in this long is treated as
 * failed rather than left holding a slot open indefinitely.
 */
const RENDER_TIMEOUT_MS = Number(process.env.POLLINATIONS_VIDEO_TIMEOUT_MS || 300000);
const UPLOAD_TIMEOUT_MS = Number(process.env.POLLINATIONS_VIDEO_UPLOAD_TIMEOUT_MS || 60000);
/** Refuse an oversized download rather than buffering an unbounded clip in memory. */
const MAX_RESPONSE_BYTES = Number(process.env.POLLINATIONS_VIDEO_MAX_BYTES || 200 * 1024 * 1024);
/** The first frame goes out to a third party, so its size is capped tightly. */
const MAX_SOURCE_IMAGE_BYTES = 10 * 1024 * 1024;

/** Refusal codes Pollinations returns in the body for a blocked generation. */
const REFUSAL_CODES = new Set(['content_blocked', 'prohibited_content', 'safety', 'nsfw', 'blocked']);

/**
 * Pollinations video generation (`GET /video/{prompt}`, MP4 out).
 *
 * This is a separate provider from the key-less image one on purpose. Pollinations
 * now requires an API key on every generation endpoint, so video cannot share the
 * anonymous image adapter: registering a video capability against a provider that
 * would answer every call with 401 would make `capabilities.video.available` a
 * claim ISOBASH cannot keep.
 *
 * Everything is opt-in (`POLLINATIONS_VIDEO_ENABLED`) and the base URL is
 * overridable, so the adapter can be exercised against a fixture without editing
 * the code path. Nothing here fabricates a clip: if the endpoint does not return
 * video bytes, the call fails and the run records the provider's own status.
 */
@Injectable()
export class PollinationsVideoProvider implements AiProvider {
  readonly name = 'pollinations-video';
  readonly capabilities: readonly AiCapability[] = ['video-generation'];
  private readonly baseUrl = (process.env.POLLINATIONS_VIDEO_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
  private readonly model = process.env.POLLINATIONS_VIDEO_MODEL || DEFAULT_MODEL;

  private get apiKey(): string | undefined {
    return process.env.POLLINATIONS_VIDEO_API_KEY || process.env.POLLINATIONS_API_KEY || undefined;
  }

  async health(): Promise<AiProviderHealth> {
    if (!this.apiKey) {
      return {
        provider: this.name,
        status: 'unconfigured',
        capabilities: [...this.capabilities],
        detail: 'POLLINATIONS_VIDEO_API_KEY is not configured, so no clip can be rendered.',
      };
    }
    return {
      provider: this.name,
      status: 'healthy',
      capabilities: [...this.capabilities],
      detail: `Video generation through ${this.model}; the key is accepted and connectivity is confirmed on the first render, which is also the only way to find out whether the account can pay.`,
    };
  }

  /** This endpoint only renders video; the interface requires `execute`, so the answer is an explicit refusal. */
  async execute(request: AiRequest): Promise<AiResponse> {
    throw new AiProviderError(
      `Pollinations video only generates video; it cannot serve ${request.capability}.`,
      this.name,
      'CAPABILITY_UNSUPPORTED',
    );
  }

  async generateVideo(request: AiVideoRequest): Promise<AiVideoResponse> {
    const key = this.apiKey;
    if (!key) {
      throw new AiProviderError(
        'POLLINATIONS_VIDEO_API_KEY is not configured, so no clip can be rendered.',
        this.name,
        'PROVIDER_NOT_CONFIGURED',
      );
    }
    if (!request.prompt.trim()) {
      throw new AiProviderError('A video prompt is required.', this.name, 'INVALID_REQUEST');
    }
    const model = request.model || this.model;
    const requestedSeconds = request.durationSeconds ?? 4;

    /**
     * Image-to-video. The provider needs a public URL for the first frame, and
     * ISOBASH's stored assets are session-authenticated by design, so the bytes are
     * uploaded to the provider rather than linked from our own API. That does make
     * the frame retrievable by URL on the provider's side until it expires, which is
     * disclosed in the run's note rather than left for the user to discover.
     */
    let firstFrameUrl: string | undefined;
    if (request.image) {
      firstFrameUrl = await this.uploadFirstFrame(request.image, key);
    }

    const url = new URL(`${this.baseUrl}/video/${encodeURIComponent(request.prompt)}`);
    url.searchParams.set('model', model);
    url.searchParams.set('duration', String(requestedSeconds));
    url.searchParams.set('audio', request.withAudio === true ? 'true' : 'false');
    // -1 is the provider's own "random seed"; a fixed seed would make every run of
    // the same prompt return the identical clip.
    url.searchParams.set('seed', '-1');
    if (request.aspectRatio) url.searchParams.set('aspectRatio', request.aspectRatio);
    if (firstFrameUrl) url.searchParams.set('image', firstFrameUrl);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), RENDER_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(url, {
        signal: controller.signal,
        headers: {
          accept: 'video/mp4,video/*;q=0.9',
          authorization: `Bearer ${key}`,
          'user-agent': 'isobash/14 (video generation)',
        },
      });
    } catch (error) {
      throw new AiProviderError(
        error instanceof Error && error.name === 'AbortError'
          ? `Pollinations did not return a clip within ${RENDER_TIMEOUT_MS}ms.`
          : `Pollinations video is unreachable from this server: ${error instanceof Error ? error.message : 'unknown error'}.`,
        this.name,
        error instanceof Error && error.name === 'AbortError' ? 'PROVIDER_TIMEOUT' : 'PROVIDER_UNAVAILABLE',
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      const refusal = refusalFromBody(body);
      if (refusal) {
        return { provider: this.name, model, video: { mimeType: 'video/mp4', data: '' }, requestedSeconds, finishReason: refusal };
      }
      throw new AiProviderError(classifyError(response.status, body), this.name, codeFor(response.status, body));
    }

    const declared = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '';
    if (declared && !declared.startsWith('video/')) {
      throw new AiProviderError(
        `Pollinations answered a video request with ${declared || 'an unknown type'}. No clip was produced.`,
        this.name,
        'EMPTY_PROVIDER_RESPONSE',
      );
    }

    const declaredLength = Number(response.headers.get('content-length') ?? '');
    if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
      throw new AiProviderError(
        `Pollinations announced ${declaredLength} bytes, over the ${MAX_RESPONSE_BYTES} byte ceiling.`,
        this.name,
        'PROVIDER_REQUEST_FAILED',
      );
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength === 0) {
      throw new AiProviderError('Pollinations returned an empty body for the video request.', this.name, 'EMPTY_PROVIDER_RESPONSE');
    }
    if (bytes.byteLength > MAX_RESPONSE_BYTES) {
      throw new AiProviderError(
        `Pollinations returned ${bytes.byteLength} bytes, over the ${MAX_RESPONSE_BYTES} byte ceiling.`,
        this.name,
        'PROVIDER_REQUEST_FAILED',
      );
    }

    // The declared type is the provider's claim. The media service sniffs the
    // container, so a wrong header here can never become a wrong `mimeType`.
    const video: AiGeneratedVideo = {
      mimeType: declared || 'video/mp4',
      data: bytes.toString('base64'),
      note: [
        `Rendered by pollinations-video (${model})`,
        request.aspectRatio ? `at ${request.aspectRatio}` : null,
        `for ${requestedSeconds}s`,
        firstFrameUrl ? 'from an uploaded first frame (retrievable by URL on the provider until it expires)' : null,
      ]
        .filter(Boolean)
        .join(' '),
    };
    return { provider: this.name, model, video, requestedSeconds };
  }

  private async uploadFirstFrame(image: { mimeType: string; data: string }, key: string): Promise<string> {
    const bytes = Buffer.from(image.data, 'base64');
    if (bytes.byteLength === 0) {
      throw new AiProviderError('The first-frame image is empty.', this.name, 'INVALID_REQUEST');
    }
    if (bytes.byteLength > MAX_SOURCE_IMAGE_BYTES) {
      throw new AiProviderError(
        `The first-frame image is ${bytes.byteLength} bytes, over the ${MAX_SOURCE_IMAGE_BYTES} byte ceiling.`,
        this.name,
        'INVALID_REQUEST',
      );
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/upload`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}`, 'user-agent': 'isobash/14 (video generation)' },
        body: JSON.stringify({
          data: bytes.toString('base64'),
          contentType: image.mimeType,
          name: 'isobash-first-frame',
        }),
      });
    } catch (error) {
      throw new AiProviderError(
        `The first frame could not be uploaded to Pollinations: ${error instanceof Error ? error.message : 'unknown error'}.`,
        this.name,
        error instanceof Error && error.name === 'AbortError' ? 'PROVIDER_TIMEOUT' : 'PROVIDER_UNAVAILABLE',
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new AiProviderError(
        `Pollinations refused the first frame (HTTP ${response.status}). ${summarize(body)}`.trim(),
        this.name,
        codeFor(response.status, body),
      );
    }
    const payload = (await response.json().catch(() => null)) as { url?: unknown } | null;
    const uploaded = typeof payload?.url === 'string' ? payload.url : '';
    if (!uploaded) {
      throw new AiProviderError(
        'Pollinations accepted the first frame but returned no retrievable URL, so it cannot be used as a start frame.',
        this.name,
        'EMPTY_PROVIDER_RESPONSE',
      );
    }
    return uploaded;
  }
}

/**
 * Pollinations reports refusals and ordinary errors in the same JSON envelope, so
 * the body, not just the status, decides which one this was.
 */
function refusalFromBody(body: string): string | null {
  const code = parseErrorCode(body);
  if (!code) return null;
  const normalized = code.toLowerCase();
  if (!REFUSAL_CODES.has(normalized) && !normalized.includes('block') && !normalized.includes('safety')) return null;
  return normalized.replace(/_/g, ' ').toUpperCase();
}

function parseErrorCode(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as { error?: { code?: unknown } };
    const code = parsed?.error?.code;
    return typeof code === 'string' ? code : null;
  } catch {
    return null;
  }
}

function summarize(body: string): string {
  return body.slice(0, 300).replace(/\s+/g, ' ');
}

function codeFor(status: number, body: string): string {
  switch (status) {
    case 400:
      return parseErrorCode(body) === 'content_blocked' ? 'PROVIDER_REFUSED' : 'PROVIDER_REQUEST_FAILED';
    case 401:
    case 403:
      return 'INVALID_API_KEY';
    case 402:
    case 429:
      return 'RATE_LIMITED';
    case 404:
      return 'MODEL_NOT_AVAILABLE';
    case 503:
      return 'PROVIDER_OVERLOADED';
    default:
      return 'PROVIDER_REQUEST_FAILED';
  }
}

function classifyError(status: number, body: string): string {
  const detail = summarize(body);
  switch (status) {
    case 400:
      return `Pollinations rejected the video request. ${detail}`.trim();
    case 401:
    case 403:
      return `Pollinations refused the request (HTTP ${status}). The video key is not valid for this endpoint. ${detail}`.trim();
    case 402:
      return `Pollinations has no pollen left for this key (HTTP 402). ${detail}`.trim();
    case 429:
      return `Pollinations rate limit reached (HTTP 429). ${detail}`.trim();
    case 404:
      return `Pollinations does not serve this video model or endpoint. ${detail}`.trim();
    case 503:
      return `Pollinations is temporarily overloaded (HTTP 503). ${detail}`.trim();
    default:
      return `Pollinations returned HTTP ${status}. ${detail}`.trim();
  }
}
