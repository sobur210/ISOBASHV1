import { Injectable } from '@nestjs/common';
import {
  AiCapability,
  AiProvider,
  AiProviderError,
  AiProviderHealth,
  AiRequest,
  AiResponse,
  AiStreamChunk,
} from './provider.types';

type GeminiPart = { text?: string };
type GeminiCandidate = {
  content?: { parts?: GeminiPart[] };
  finishReason?: string;
};
type GeminiUsage = { promptTokenCount?: number; candidatesTokenCount?: number };
type GeminiGenerateResponse = {
  candidates?: GeminiCandidate[];
  usageMetadata?: GeminiUsage;
  modelVersion?: string;
};
type GeminiErrorBody = { error?: { code?: number; message?: string; status?: string } };

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
/**
 * Stable, generally available (non-preview) Flash model.
 *
 * `gemini-2.5-flash` was retired for newly provisioned API keys and now answers
 * `404 ... no longer available to new users`, so it cannot be the default. The
 * 3.x Flash line is stable GA on the free tier and is verified live by
 * `verifyConfiguredModel()` below, which reports the truth instead of assuming.
 */
const DEFAULT_MODEL = 'gemini-3.7-flash';
const MODEL_CHECK_TTL_MS = Number(process.env.GEMINI_MODEL_CHECK_TTL_MS || 10 * 60 * 1000);

function classifyGeminiError(status: number, body?: GeminiErrorBody | null): { code: string; detail: string } {
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
        detail: `Gemini does not serve model "${DEFAULT_MODEL}" for this API key.${geminiMessage ? ` ${geminiMessage}` : ''}`,
      };
    case 429:
      return {
        code: 'RATE_LIMITED',
        detail: 'Gemini rate limit reached. The provider did not respond; no fallback was used.',
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
  readonly capabilities: readonly AiCapability[] = ['language'];
  private readonly model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  private modelCheck: { at: number; ok: boolean; detail: string } | null = null;
  private healthCache: { at: number; value: AiProviderHealth } | null = null;

  /**
   * Confirm the configured model can actually generate for this key.
   *
   * `GET /models/{model}` still answers 200 for models that are listed but no
   * longer served to new keys, so metadata is not proof. A one-token generation is
   * the only honest signal, and it is cached for 10 minutes so the admin health
   * panel (which polls every 10s) does not burn quota.
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
            generationConfig: { maxOutputTokens: 1 },
          }),
        },
      );
      if (!response.ok) {
        const body = await readError(response);
        const { detail } = classifyGeminiError(response.status, body);
        this.modelCheck = { at: Date.now(), ok: false, detail };
        return { ok: false, detail };
      }
      await response.json().catch(() => null);
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
        const { detail } = classifyGeminiError(response.status, body);
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
          body: JSON.stringify({ contents: [{ parts: [{ text: request.input }] }] }),
        },
      );
      if (!response.ok) {
        const body = await readError(response);
        const { code, detail } = classifyGeminiError(response.status, body);
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
        const { code, detail } = classifyGeminiError(response.status, body);
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