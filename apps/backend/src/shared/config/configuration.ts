import { existsSync, mkdirSync } from 'fs';
import { resolve, join } from 'path';
import { config as loadDotEnv } from 'dotenv';

export type StorageRoots = {
  dataRoot: string;
  uploadRoot: string;
  mediaRoot: string;
  tempRoot: string;
  logsRoot: string;
  cacheRoot: string;
  knowledgeRoot: string;
  modelRoot: string;
};

export type AppConfig = {
  port: number;
  webUrl: string;
  apiUrl: string;
  databaseUrl: string;
  redisUrl: string;
  ollama: {
    enabled: boolean;
    baseUrl: string;
    model: string;
  };
  openai: {
    enabled: boolean;
    baseUrl: string;
    model: string;
    apiKey?: string;
  };
  gemini: {
    enabled: boolean;
    model: string;
    apiKey?: string;
  };
  security: {
    appSecret: string;
    authRateLimit: { limit: number; windowMs: number };
    registerRateLimit: { limit: number; windowMs: number };
    mfaRateLimit: { limit: number; windowMs: number };
    loginFailuresPerAccount: { limit: number; windowMs: number };
  };
  storage: StorageRoots;
  env: string;
};

function requireString(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  if (!value) {
    throw new Error(`Environment variable ${key} is required but missing. Refusing to start.`);
  }
  return value;
}

function requireBoolean(env: NodeJS.ProcessEnv, key: string): boolean {
  const value = env[key];
  if (value !== undefined && value !== 'true' && value !== 'false') {
    throw new Error(`Environment variable ${key} must be "true" or "false", got "${value}".`);
  }
  return value === 'true';
}

function optionalString(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const value = env[key];
  return value && value.length > 0 ? value : undefined;
}

function resolveRepoRoot(): string {
  let dir = __dirname;
  for (let i = 0; i < 12; i += 1) {
    if (existsSync(join(dir, 'apps')) && existsSync(join(dir, 'prisma'))) return dir;
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

function rootDir(...segments: string[]): string {
  return resolve(...segments);
}

function firstConfigured(env: NodeJS.ProcessEnv, key: string, fallback: string): string {
  return optionalString(env, key) ?? fallback;
}

let cached: AppConfig | undefined;
let envLoaded = false;

export function resolveEnvFile(): string | undefined {
  let dir = __dirname;
  for (let i = 0; i < 10; i += 1) {
    const candidate = join(dir, '.env');
    if (existsSync(candidate)) return candidate;
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

function ensureEnvLoaded(): void {
  if (envLoaded) return;
  const envFile = resolveEnvFile();
  if (envFile) {
    loadDotEnv({ path: envFile });
  }
  envLoaded = true;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  ensureEnvLoaded();
  if (cached) return cached;

  const dataRoot = firstConfigured(env, 'DATA_ROOT', rootDir(resolveRepoRoot(), '..', 'ISOBASH-DATA'));
  const storage: StorageRoots = {
    dataRoot,
    uploadRoot: firstConfigured(env, 'UPLOAD_ROOT', join(dataRoot, 'uploads')),
    mediaRoot: firstConfigured(env, 'MEDIA_ROOT', join(dataRoot, 'media')),
    tempRoot: firstConfigured(env, 'TEMP_ROOT', join(dataRoot, 'temp')),
    logsRoot: firstConfigured(env, 'LOGS_ROOT', join(dataRoot, 'logs')),
    cacheRoot: firstConfigured(env, 'CACHE_ROOT', join(dataRoot, 'cache')),
    knowledgeRoot: firstConfigured(env, 'KNOWLEDGE_ROOT', join(dataRoot, 'knowledge')),
    modelRoot: firstConfigured(env, 'MODEL_ROOT', rootDir(resolveRepoRoot(), '..', 'ISOBASH-MODELS')),
  };

  const config: AppConfig = {
    env: env.NODE_ENV || 'development',
    port: Number(process.env.PORT || 3001),
    webUrl: env.WEB_URL || 'http://localhost:3000',
    apiUrl: env.API_URL || `http://localhost:${process.env.PORT || 3001}`,
    databaseUrl: requireString(env, 'DATABASE_URL'),
    redisUrl: optionalString(env, 'REDIS_URL') || 'redis://localhost:6379',
    ollama: {
      enabled: requireBoolean(env, 'OLLAMA_ENABLED'),
      baseUrl: optionalString(env, 'OLLAMA_BASE_URL') || 'http://127.0.0.1:11434',
      model: optionalString(env, 'OLLAMA_MODEL') || 'llama3.2:latest',
    },
    openai: {
      enabled: requireBoolean(env, 'OPENAI_ENABLED'),
      baseUrl: optionalString(env, 'OPENAI_BASE_URL') || 'https://api.openai.com/v1',
      model: optionalString(env, 'OPENAI_MODEL') || 'gpt-4o-mini',
      apiKey: optionalString(env, 'OPENAI_API_KEY'),
    },
    gemini: {
      enabled: requireBoolean(env, 'GEMINI_ENABLED'),
      model: optionalString(env, 'GEMINI_MODEL') || 'gemini-3.7-flash',
      apiKey: optionalString(env, 'GEMINI_API_KEY'),
    },
    security: {
      appSecret: requireString(env, 'APP_SECRET'),
      authRateLimit: {
        limit: Number(env.RATE_LIMIT_AUTH_MAX || 30),
        windowMs: Number(env.RATE_LIMIT_AUTH_WINDOW_MS || 15 * 60 * 1000),
      },
      registerRateLimit: {
        limit: Number(env.RATE_LIMIT_REGISTER_MAX || 30),
        windowMs: Number(env.RATE_LIMIT_REGISTER_WINDOW_MS || 15 * 60 * 1000),
      },
      mfaRateLimit: {
        limit: Number(env.RATE_LIMIT_MFA_MAX || 10),
        windowMs: Number(env.RATE_LIMIT_MFA_WINDOW_MS || 15 * 60 * 1000),
      },
      loginFailuresPerAccount: {
        limit: Number(env.RATE_LIMIT_LOGIN_FAILURES_MAX || 5),
        windowMs: Number(env.RATE_LIMIT_LOGIN_FAILURES_WINDOW_MS || 15 * 60 * 1000),
      },
    },
    storage,
  };

  if (config.openai.enabled && !config.openai.apiKey) {
    throw new Error('OPENAI_ENABLED is true but OPENAI_API_KEY is missing. Refusing to start.');
  }
  if (config.gemini.enabled && !config.gemini.apiKey) {
    throw new Error('GEMINI_ENABLED is true but GEMINI_API_KEY is missing. Refusing to start.');
  }
  if (Number.isNaN(config.port) || config.port < 1 || config.port > 65535) {
    throw new Error(`PORT must be a valid TCP port, got "${env.PORT}".`);
  }

  cached = config;
  return config;
}

export function ensureStorageRoots(config: AppConfig): void {
  for (const dir of Object.values(config.storage)) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
}