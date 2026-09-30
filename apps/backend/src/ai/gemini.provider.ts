import { Injectable } from '@nestjs/common';
import {
  AiCapability,
  AiEmbeddingRequest,
  AiEmbeddingResponse,
  AiGeneratedImage,
  AiImageRequest,
  AiImageResponse,
  AiProvider,
  AiProviderError,
  AiProviderHealth,
  AiRequest,
  AiResponse,
  AiStreamChunk,
  isProviderRefusal,
} from './provider.types';

type GeminiInlineData = { mimeType?: string; data?: string };
type GeminiPart = { text?: string; inlineData?: GeminiInlineData };
type GeminiCandidate = {
  content?: { parts?: GeminiPart[] };
  finishReason?: string;
};
type GeminiUsage = { promptTokenCount?: number; candidatesTokenCount?: number };
type GeminiGenerateResponse = {
  candidates?: GeminiCandidate[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: GeminiUsage;
  modelVersion?: string;
};
type GeminiErrorBody = { error?: { code?: number; message?: string; status?: string } };

/**
 * Google's Generative Language endpoint, overridable so the verification run
 * can point the real adapter at a fixture that speaks the same response shape.
 * Same seam as `OLLAMA_BASE_URL` / `OPENAI_BASE_URL`; unset in normal use, and
 * nothing in the provider branches on it.
 */
const API_BASE = (process.env.GEMINI_API_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta').replace(
  /\/+$/,
  '',
);
/**
 * Stable, generally available (non-preview) Flash model.
 *
 * `gemini-2.5-flash` was retired for newly provisioned API keys and now answers
 * `404 ... no longer available to new users`, so it cannot be the default. The
 * 3.x Flash line is stable GA on the free tier and is verified live by
 * `verifyConfiguredModel()` below, which reports the truth instead of assuming.
 */
const DEFAULT_MODEL = 'gemini-3.7-flash';
/**
 * Phase 13 image model. Verified to be listed for the key at runtime, but
 * *listing* is not serving: a free-tier key can see image models and still be
 * refused with a zero image quota. `generateImage` therefore surfaces that
 * refusal rather than reporting a generation that did not happen.
 */
const DEFAULT_IMAGE_MODEL = 'gemini-3.1-flash-image';
const MODEL_CHECK_TTL_MS = Number(process.env.GEMINI_MODEL_CHECK_TTL_MS || 10 * 60 * 1000);
/**
 * Output budget for the live health probe.
 *
 * Must comfortably exceed a thinking model's own reasoning, because Gemini
 * spends `maxOutputTokens` on `thoughtsTokenCount` before it emits any text. The
 * 3.x Flash line typically reasons for 60-95 tokens on a trivial prompt, so a
 * budget near that returns 200 with `finishReason: MAX_TOKENS` and zero text.
 * The probe still costs a handful of tokens and runs at most every 10 minutes.
 */
const HEALTH_PROBE_MAX_OUTPUT_TOKENS = Number(process.env.GEMINI_HEALTH_PROBE_MAX_TOKENS || 512);
/** Hard ceiling so a bad `count` cannot turn one request into an unbounded spend. */
const MAX_IMAGES_PER_CALL = 8;

/**
 * `model` is the model the failing call actually asked for. It is a parameter
 * because Gemini has separate text and image models: a 404 from the image path
 * naming the text default would send the operator to check a model that was
 * never the one that failed.
 */
function classifyGeminiError(
  status: number,
  model: string,
  body?: GeminiErrorBody | null,
): { code: string; detail: string } {
  const geminiStatus = body?.error?.status;
  const geminiMessage = body?.error?.message;
  switch (status) {
    case 400:
      return {
        code: 'PROVIDER_REQUEST_FAILED',
        detail: `Gemini rejected the request (${geminiStatus ?? `HTTP ${status}`}).${geminiMessage ? ` ${geminiMessage}` : ''}`,
      };
    case 401:
    case 403:
      return {
        code: 'INVALID_API_KEY',
        detail: 'Gemini rejected the API key (authentication failed). Check GEMINI_API_KEY.',
      };
    case 404:
      return {
        code: 'MODEL_NOT_AVAILABLE',
        detail: `Gemini does not serve model "${model}" for this API key.${geminiMessage ? ` ${geminiMessage}` : ''}`,
      };
    case 429:
      // The body distinguishes a burst from a plan that grants zero of this metric.
      // "rate limit, try later" and "your key has no image quota at all" are very
      // different problems, so the provider's own words are kept.
      return {
        code: 'RATE_LIMITED',
        detail: `Gemini rate limit reached and it did not answer; no fallback was used.${geminiMessage ? ` ${geminiMessage}` : ''}`,
      };
    case 503:
      return {
        code: 'PROVIDER_OVERLOADED',
        detail: `Gemini is temporarily overloaded (HTTP 503).${geminiMessage ? ` ${geminiMessage}` : ''}`,
      };
    default:
      return {
        code: 'PROVIDER_REQUEST_FAILED',
        detail: `Gemini returned HTTP ${status}.${geminiMessage ? ` ${geminiMessage}` : ''}`,
      };
  }
}

async function readError(response: Response): Promise<GeminiErrorBody | null> {
  try {
    return (await response.json()) as GeminiErrorBody;
  } catch {
    return null;
  }
}

@Injectable()
export class GeminiProvider implements AiProvider {
  readonly name = 'gemini';
  /**
   * Image generation is opt-out rather than implicit: a deployment that only
   * wants Gemini for text and embeddings sets `GEMINI_IMAGE_ENABLED=false` and the
   * capability disappears from `/ai/capabilities` instead of being offered and
   * then refused at call time.
   */
  private readonly imageEnabled = process.env.GEMINI_IMAGE_ENABLED !== 'false';
  readonly capabilities: readonly AiCapability[] = this.imageEnabled
    ? ['language', 'embeddings', 'image-generation']
    : ['language', 'embeddings'];
  private readonly model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  private readonly embeddingModel = process.env.GEMINI_EMBEDDING_MODEL || 'text-embedding-004';
  private readonly imageModel = process.env.GEMINI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL;
  private modelCheck: { at: number; ok: boolean; detail: string } | null = null;
  private healthCache: { at: number; value: AiProviderHealth } | null = null;

  /**
   * Confirm the configured model can actually generate for this key.
   *
   * `GET /models/{model}` still answers 200 for models that are listed but no
   * longer served to new keys, so metadata is not proof. A real generation is the
   * only honest signal, and it is cached for 10 minutes so the admin health
   * panel (which polls every 10s) does not burn quota.
   *
   * Two things make this more than a "did it return 200" check:
   *
   * The budget must be large enough to actually yield text. The 3.x Flash line is
   * a thinking model: it spends the output budget on `thoughtsTokenCount` first
   * and returns a 200 with `finishReason: MAX_TOKENS` and **zero** text parts
   * when the cap is too small to reach an answer. A probe asking for one token
   * therefore passes on a model that cannot complete a one-word reply, which is
   * the opposite of what this function exists to detect.
   *
   * And the response body must contain text, because that 200-with-no-parts is
   * indistinguishable from success if the body is not read.
   */
  private async verifyConfiguredModel(apiKey: string): Promise<{ ok: boolean; detail: string }> {
    if (this.modelCheck && Date.now() - this.modelCheck.at < MODEL_CHECK_TTL_MS) {
      return { ok: this.modelCheck.ok, detail: this.modelCheck.detail };
    }
    const model = this.model;
    try {
      const response = await fetch(
        `${API_BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'ping' }] }],
            generationConfig: { maxOutputTokens: HEALTH_PROBE_MAX_OUTPUT_TOKENS },
          }),
        },
      );
      if (!response.ok) {
        const body = await readError(response);
        const { detail } = classifyGeminiError(response.status, model, body);
        this.modelCheck = { at: Date.now(), ok: false, detail };
        return { ok: false, detail };
      }
      const payload = (await response.json().catch(() => null)) as GeminiGenerateResponse | null;
      const text = extractGeminiText(payload?.candidates);
      if (!text) {
        // 200 with nothing to show. Report the reason the provider gave rather
        // than calling a model that cannot answer "healthy".
        const reason = payload?.candidates?.[0]?.finishReason ?? payload?.promptFeedback?.blockReason;
        const detail = `Gemini answered ${model} with no output text${reason ? ` (finishReason: ${reason})` : ''}. The key was accepted but the model did not produce a usable completion.`;
        this.modelCheck = { at: Date.now(), ok: false, detail };
        return { ok: false, detail };
      }
      const detail = `Model ${model} is reachable and the API key was validated live.`;
      this.modelCheck = { at: Date.now(), ok: true, detail };
      return { ok: true, detail };
    } catch (error) {
      const detail = 'Gemini is unreachable from this server.';
      this.modelCheck = { at: Date.now(), ok: false, detail: `${detail} ${error instanceof Error ? error.message : ''}`.trim() };
      return { ok: false, detail: this.modelCheck.detail };
    }
  }

  async health(): Promise<AiProviderHealth> {
    if (this.healthCache && Date.now() - this.healthCache.at < 30_000) {
      return this.healthCache.value;
    }
    const value = await this.computeHealth();
    this.healthCache = { at: Date.now(), value };
    return value;
  }

  private async computeHealth(): Promise<AiProviderHealth> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return {
        provider: this.name,
        status: 'unconfigured',
        capabilities: [...this.capabilities],
        detail: 'GEMINI_API_KEY is not configured.',
      };
    }
    try {
      const response = await fetch(`${API_BASE}/models?key=${encodeURIComponent(apiKey)}&pageSize=1`);
      if (!response.ok) {
        const body = await readError(response);
        // A key-level failure is not attributable to one model, so the listing
        // call reports the text default and the key problem in the same sentence.
        const { detail } = classifyGeminiError(response.status, this.model, body);
        return { provider: this.name, status: 'unavailable', capabilities: [...this.capabilities], detail };
      }
      const modelCheck = await this.verifyConfiguredModel(apiKey);
      return {
        provider: this.name,
        status: modelCheck.ok ? 'healthy' : 'unavailable',
        capabilities: [...this.capabilities],
        detail: modelCheck.detail,
      };
    } catch {
      return {
        provider: this.name,
        status: 'unavailable',
        capabilities: [...this.capabilities],
        detail: 'Gemini is unreachable from this server.',
      };
    }
  }

  async execute(request: AiRequest): Promise<AiResponse> {
    this.assertLanguageCapability(request);
    const apiKey = this.requireApiKey();
    const model = request.model || this.model;

    try {
      const response = await fetch(
        `${API_BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: request.input }] }],
            ...(request.responseFormat === 'json'
              ? { generationConfig: { responseMimeType: 'application/json' } }
              : {}),
          }),
        },
      );
      if (!response.ok) {
        const body = await readError(response);
        const { code, detail } = classifyGeminiError(response.status, model, body);
        throw new AiProviderError(detail, this.name, code);
      }
      const payload = (await response.json()) as GeminiGenerateResponse;
      const output = extractGeminiText(payload.candidates);
      if (!output) {
        throw new AiProviderError('Gemini returned no response text.', this.name, 'EMPTY_PROVIDER_RESPONSE');
      }
      return {
        provider: this.name,
        model: payload.modelVersion || model,
        capability: request.capability,
        output,
        usage: {
          inputTokens: payload.usageMetadata?.promptTokenCount,
          outputTokens: payload.usageMetadata?.candidatesTokenCount,
        },
      };
    } catch (error) {
      if (error instanceof AiProviderError) throw error;
      throw new AiProviderError(error instanceof Error ? error.message : 'Gemini request failed.', this.name, 'PROVIDER_UNAVAILABLE');
    }
  }

  async *stream(request: AiRequest, signal?: AbortSignal): AsyncIterable<AiStreamChunk> {
    this.assertLanguageCapability(request);
    const apiKey = this.requireApiKey();
    const model = request.model || this.model;

    let response: Response;
    try {
      response = await fetch(
        `${API_BASE}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: request.input }] }] }),
          signal,
        },
      );
      if (!response.ok) {
        const body = await readError(response);
        const { code, detail } = classifyGeminiError(response.status, model, body);
        throw new AiProviderError(detail, this.name, code);
      }
      if (!response.body) {
        throw new AiProviderError('Gemini returned no response body.', this.name, 'EMPTY_PROVIDER_RESPONSE');
      }
    } catch (error) {
      if (signal?.aborted) throw new AiProviderError('Generation aborted.', this.name, 'STREAM_ABORTED');
      if (error instanceof AiProviderError) throw error;
      throw new AiProviderError(error instanceof Error ? error.message : 'Gemini stream request failed.', this.name, 'PROVIDER_UNAVAILABLE');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const usage: { inputTokens?: number; outputTokens?: number } = {};

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newline: number;
        while ((newline = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (!line.startsWith('data:')) continue;
          const raw = line.slice(5).trim();
          if (!raw) continue;

          let payload: GeminiGenerateResponse;
          try {
            payload = JSON.parse(raw) as GeminiGenerateResponse;
          } catch {
            continue;
          }

          if (payload.usageMetadata?.promptTokenCount != null) {
            usage.inputTokens = payload.usageMetadata.promptTokenCount;
          }
          if (payload.usageMetadata?.candidatesTokenCount != null) {
            usage.outputTokens = payload.usageMetadata.candidatesTokenCount;
          }

          const text = extractGeminiText(payload.candidates);
          if (text) {
            yield { type: 'delta', text };
          }
        }
      }
      yield { type: 'done', provider: this.name, model, usage };
    } catch (error) {
      if (signal?.aborted) throw new AiProviderError('Generation aborted.', this.name, 'STREAM_ABORTED');
      throw new AiProviderError(error instanceof Error ? error.message : 'Gemini stream interrupted.', this.name, 'PROVIDER_STREAM_FAILED');
    }
  }

  /**
   * `:embedContent` takes one input per call, so a batch is sent as a short
   * sequential run. Rate limits and overload are surfaced verbatim: an index
   * must never be built from a silently half-embedded document.
   */
  async embed(request: AiEmbeddingRequest): Promise<AiEmbeddingResponse> {
    if (request.inputs.length === 0) {
      throw new AiProviderError('Gemini was asked to embed an empty batch.', this.name, 'INVALID_REQUEST');
    }
    const apiKey = this.requireApiKey();
    const model = request.model || this.embeddingModel;
    const embeddings: number[][] = [];
    try {
      for (const input of request.inputs) {
        const response = await fetch(
          `${API_BASE}/models/${encodeURIComponent(model)}:embedContent?key=${encodeURIComponent(apiKey)}`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              model: `models/${model}`,
              content: { parts: [{ text: input }] },
              ...(request.taskType ? { taskType: request.taskType } : {}),
            }),
          },
        );
        if (!response.ok) {
          const body = await readError(response);
          const { code, detail } = classifyGeminiError(response.status, model, body);
          throw new AiProviderError(detail, this.name, code);
        }
        const payload = (await response.json()) as { embedding?: { values?: number[] } };
        const values = payload.embedding?.values ?? [];
        if (values.length === 0) {
          throw new AiProviderError('Gemini returned an empty embedding.', this.name, 'EMPTY_PROVIDER_RESPONSE');
        }
        embeddings.push(values);
      }
      return { provider: this.name, model, embeddings, dimensions: embeddings[0].length };
    } catch (error) {
      if (error instanceof AiProviderError) throw error;
      throw new AiProviderError(error instanceof Error ? error.message : 'Gemini embedding request failed.', this.name, 'PROVIDER_UNAVAILABLE');
    }
  }

  /**
   * Phase 13 image generation.
   *
   * Gemini renders one image per `:generateContent` call, so `count` is driven as
   * a short sequential run. Three rules keep the result honest:
   *  - a call that fails is recorded in `failures` with the provider's own code and
   *    message, so "1 of 3 images" is never reported as "3 images";
   *  - a run where nothing was produced throws the first real provider error, so a
   *    quota refusal or a bad key cannot be mistaken for an empty gallery;
   *  - a refusal (`promptFeedback.blockReason`, `IMAGE_SAFETY`, …) is returned
   *    rather than thrown, because the provider answered on purpose and the caller
   *    should record a block, not an outage.
   */
  async generateImage(request: AiImageRequest): Promise<AiImageResponse> {
    if (!this.imageEnabled) {
      throw new AiProviderError('Gemini image generation is disabled (GEMINI_IMAGE_ENABLED=false).', this.name, 'CAPABILITY_UNSUPPORTED');
    }
    const apiKey = this.requireApiKey();
    const model = request.model || this.imageModel;
    const requested = Math.min(Math.max(request.count ?? 1, 1), MAX_IMAGES_PER_CALL);

    const images: AiGeneratedImage[] = [];
    const failures: { code: string; message: string }[] = [];
    let finishReason: string | undefined;
    const usage: { inputTokens?: number; outputTokens?: number } = {};

    for (let index = 0; index < requested; index += 1) {
      let response: Response;
      try {
        response = await fetch(
          `${API_BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: request.prompt }] }],
              generationConfig: {
                // Without IMAGE in the modalities list the model only answers with
                // text, and a text-only "success" would be stored as an image.
                responseModalities: ['TEXT', 'IMAGE'],
                ...(request.aspectRatio ? { imageConfig: { aspectRatio: request.aspectRatio } } : {}),
              },
            }),
          },
        );
      } catch (error) {
        failures.push({
          code: 'PROVIDER_UNAVAILABLE',
          message: error instanceof Error ? error.message : 'Gemini is unreachable from this server.',
        });
        continue;
      }

      if (!response.ok) {
        const body = await readError(response);
        const { code, detail } = classifyGeminiError(response.status, model, body);
        failures.push({ code, message: detail });
        // Quota, a rejected key and a retired model are answers, not blips: burning
        // the remaining calls would only spend the same budget to reach the same wall.
        if (code !== 'PROVIDER_REQUEST_FAILED' && code !== 'PROVIDER_OVERLOADED') break;
        continue;
      }

      const payload = (await response.json()) as GeminiGenerateResponse;
      if (payload.usageMetadata?.promptTokenCount != null) {
        usage.inputTokens = (usage.inputTokens ?? 0) + payload.usageMetadata.promptTokenCount;
      }
      if (payload.usageMetadata?.candidatesTokenCount != null) {
        usage.outputTokens = (usage.outputTokens ?? 0) + payload.usageMetadata.candidatesTokenCount;
      }

      const candidate = payload.candidates?.[0];
      const reason = candidate?.finishReason ?? payload.promptFeedback?.blockReason;
      if (reason) finishReason = reason;

      const note = (candidate?.content?.parts ?? []).map((part) => part.text ?? '').join('').trim();
      const produced = (candidate?.content?.parts ?? []).filter(
        (part): part is GeminiPart & { inlineData: GeminiInlineData } =>
          Boolean(part.inlineData?.data),
      );
      for (const part of produced) {
        images.push({
          mimeType: part.inlineData.mimeType || 'image/png',
          data: part.inlineData.data as string,
          ...(note ? { note } : {}),
        });
      }
      if (produced.length === 0 && !isProviderRefusal(reason)) {
        failures.push({
          code: 'EMPTY_PROVIDER_RESPONSE',
          message: note
            ? `Gemini answered with text instead of an image: ${note.slice(0, 200)}`
            : 'Gemini returned no image data.',
        });
      }
    }

    if (images.length === 0 && isProviderRefusal(finishReason)) {
      return {
        provider: this.name,
        model,
        images: [],
        requested,
        finishReason,
        ...(failures.length > 0 ? { failures } : {}),
        usage,
      };
    }
    if (images.length === 0) {
      const first = failures[0];
      throw new AiProviderError(
        first?.message ?? 'Gemini returned no image data.',
        this.name,
        first?.code ?? 'EMPTY_PROVIDER_RESPONSE',
      );
    }

    return {
      provider: this.name,
      model,
      images,
      requested,
      ...(finishReason ? { finishReason } : {}),
      ...(failures.length > 0 ? { failures } : {}),
      usage,
    };
  }

  private assertLanguageCapability(request: AiRequest): void {
    if (request.capability !== 'language') {
      throw new AiProviderError(`Gemini does not support ${request.capability}.`, this.name, 'CAPABILITY_UNSUPPORTED');
    }
  }

  private requireApiKey(): string {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new AiProviderError('GEMINI_API_KEY is required for cloud execution.', this.name, 'PROVIDER_NOT_CONFIGURED');
    }
    return apiKey;
  }
}

function extractGeminiText(candidates?: GeminiCandidate[]): string {
  const parts = candidates?.[0]?.content?.parts ?? [];
  return parts.map((part) => part.text ?? '').join('').trim();
}