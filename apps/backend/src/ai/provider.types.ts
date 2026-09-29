export type AiCapability =
  | 'language'
  | 'vision'
  | 'embeddings'
  | 'image-generation'
  | 'video-generation'
  | 'research';

export type AiMode = 'online' | 'offline' | 'hybrid';

export type AiRequest = {
  capability: AiCapability;
  input: string;
  model?: string;
  mode?: AiMode;
  metadata?: Record<string, string>;
  /**
   * Phase 10: request a machine-readable JSON object when the provider supports
   * it (Ollama `format: json`, Gemini `responseMimeType`, OpenAI
   * `response_format`). This is what makes agent planning and tool calling real
   * instead of a model output being regex-scraped for JSON.
   */
  responseFormat?: 'text' | 'json';
};

export type AiResponse = {
  provider: string;
  model: string;
  capability: AiCapability;
  output: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
};

export type AiProviderHealth = {
  provider: string;
  status: 'healthy' | 'unconfigured' | 'unavailable';
  capabilities: AiCapability[];
  detail?: string;
};

export type AiStreamChunk =
  | { type: 'delta'; text: string }
  | { type: 'done'; provider: string; model: string; usage?: { inputTokens?: number; outputTokens?: number } }
  | { type: 'error'; code: string; message: string };

/**
 * Phase 12: embedding requests. Batched because indexing a document means
 * hundreds of chunks, and one HTTP round trip per chunk is the difference
 * between a usable index and a slow one.
 */
export type AiEmbeddingRequest = {
  inputs: string[];
  model?: string;
  /**
   * `RETRIEVAL_DOCUMENT` for the text being stored and `RETRIEVAL_QUERY` for
   * a search query. Providers that do not support task types ignore it.
   */
  taskType?: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY';
};

export type AiEmbeddingResponse = {
  provider: string;
  model: string;
  embeddings: number[][];
  dimensions: number;
};

/**
 * Phase 13 image generation.
 *
 * `count` is what the caller asked for, not a promise: providers that only render
 * one image per call are driven repeatedly by the adapter, and anything that could
 * not be produced is reported in `failures` rather than quietly dropped.
 */
export type AiImageRequest = {
  prompt: string;
  model?: string;
  /** Aspect ratio such as `16:9`, validated against `MEDIA_ASPECT_RATIOS`. */
  aspectRatio?: string;
  count?: number;
};

export type AiGeneratedImage = {
  mimeType: string;
  /** Base64 payload exactly as the provider returned it. */
  data: string;
  /** The provider's own note about the image, when it returned one. */
  note?: string;
};

export type AiImageResponse = {
  provider: string;
  model: string;
  images: AiGeneratedImage[];
  /** How many images the request asked for. */
  requested: number;
  /**
   * Provider finish reasons that mean the provider refused rather than failed.
   * `IMAGE_SAFETY` and `PROHIBITED_CONTENT` are the provider's own verdict, not a
   * moderation classifier ISOBASH runs, and are reported as such.
   */
  finishReason?: string;
  /** Per-image errors for the calls that did not produce bytes. */
  failures?: { code: string; message: string }[];
  /**
   * Providers the router tried and had to leave, and why. Present so a run that
   * succeeded on a second renderer says so out loud instead of quietly showing
   * an image the user believes came from the model they picked.
   */
  failovers?: string[];
  usage?: { inputTokens?: number; outputTokens?: number };
};

/** Finish reasons a provider uses to say "I will not produce this", not "I failed". */
export const PROVIDER_REFUSAL_REASONS = new Set([
  'IMAGE_SAFETY',
  'PROHIBITED_CONTENT',
  'BLOCKLIST',
  'SAFETY',
  'RECITATION',
]);

export function isProviderRefusal(finishReason?: string): boolean {
  return finishReason ? PROVIDER_REFUSAL_REASONS.has(finishReason.toUpperCase()) : false;
}

export interface AiProvider {
  readonly name: string;
  readonly capabilities: readonly AiCapability[];
  health(): Promise<AiProviderHealth>;
  execute(request: AiRequest): Promise<AiResponse>;
  /** Present only when the provider can really produce vectors. */
  embed?(request: AiEmbeddingRequest): Promise<AiEmbeddingResponse>;
  /** Present only when the provider can really produce image bytes. */
  generateImage?(request: AiImageRequest): Promise<AiImageResponse>;
  stream?(request: AiRequest, signal?: AbortSignal): AsyncIterable<AiStreamChunk>;
}

export class AiProviderError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
}
