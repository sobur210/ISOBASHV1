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

export interface AiProvider {
  readonly name: string;
  readonly capabilities: readonly AiCapability[];
  health(): Promise<AiProviderHealth>;
  execute(request: AiRequest): Promise<AiResponse>;
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
