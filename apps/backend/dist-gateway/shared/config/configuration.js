"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveEnvFile = resolveEnvFile;
exports.loadConfig = loadConfig;
exports.ensureStorageRoots = ensureStorageRoots;
const fs_1 = require("fs");
const path_1 = require("path");
const dotenv_1 = require("dotenv");
function requireString(env, key) {
    const value = env[key];
    if (!value) {
        throw new Error(`Environment variable ${key} is required but missing. Refusing to start.`);
    }
    return value;
}
function requireBoolean(env, key) {
    const value = env[key];
    if (value !== undefined && value !== 'true' && value !== 'false') {
        throw new Error(`Environment variable ${key} must be "true" or "false", got "${value}".`);
    }
    return value === 'true';
}
function optionalString(env, key) {
    const value = env[key];
    return value && value.length > 0 ? value : undefined;
}
/**
 * A flag that is absent takes `fallback`; a flag that is present but is not
 * exactly "true" or "false" refuses to start. Same reasoning as
 * `requireBoolean`: a typo in a flag must not read as "off" (or "on") and
 * silently retire a surface nobody meant to retire.
 */
function booleanWithDefault(env, key, fallback) {
    const value = env[key];
    if (value === undefined || value === '')
        return fallback;
    if (value !== 'true' && value !== 'false') {
        throw new Error(`Environment variable ${key} must be "true" or "false", got "${value}".`);
    }
    return value === 'true';
}
function resolveRepoRoot() {
    let dir = __dirname;
    for (let i = 0; i < 12; i += 1) {
        if ((0, fs_1.existsSync)((0, path_1.join)(dir, 'apps')) && (0, fs_1.existsSync)((0, path_1.join)(dir, 'prisma')))
            return dir;
        const parent = (0, path_1.resolve)(dir, '..');
        if (parent === dir)
            break;
        dir = parent;
    }
    return process.cwd();
}
function rootDir(...segments) {
    return (0, path_1.resolve)(...segments);
}
function firstConfigured(env, key, fallback) {
    return optionalString(env, key) ?? fallback;
}
let cached;
let envLoaded = false;
function resolveEnvFile() {
    let dir = __dirname;
    for (let i = 0; i < 10; i += 1) {
        const candidate = (0, path_1.join)(dir, '.env');
        if ((0, fs_1.existsSync)(candidate))
            return candidate;
        const parent = (0, path_1.resolve)(dir, '..');
        if (parent === dir)
            break;
        dir = parent;
    }
    return undefined;
}
function ensureEnvLoaded() {
    if (envLoaded)
        return;
    const envFile = resolveEnvFile();
    if (envFile) {
        (0, dotenv_1.config)({ path: envFile });
    }
    envLoaded = true;
}
function loadConfig(env = process.env) {
    ensureEnvLoaded();
    if (cached)
        return cached;
    const dataRoot = firstConfigured(env, 'DATA_ROOT', rootDir(resolveRepoRoot(), '..', 'ISOBASH-DATA'));
    const storage = {
        dataRoot,
        uploadRoot: firstConfigured(env, 'UPLOAD_ROOT', (0, path_1.join)(dataRoot, 'uploads')),
        mediaRoot: firstConfigured(env, 'MEDIA_ROOT', (0, path_1.join)(dataRoot, 'media')),
        tempRoot: firstConfigured(env, 'TEMP_ROOT', (0, path_1.join)(dataRoot, 'temp')),
        logsRoot: firstConfigured(env, 'LOGS_ROOT', (0, path_1.join)(dataRoot, 'logs')),
        cacheRoot: firstConfigured(env, 'CACHE_ROOT', (0, path_1.join)(dataRoot, 'cache')),
        knowledgeRoot: firstConfigured(env, 'KNOWLEDGE_ROOT', (0, path_1.join)(dataRoot, 'knowledge')),
        modelRoot: firstConfigured(env, 'MODEL_ROOT', rootDir(resolveRepoRoot(), '..', 'ISOBASH-MODELS')),
    };
    const config = {
        env: env.NODE_ENV || 'development',
        port: Number(process.env.PORT || 3001),
        webUrl: env.WEB_URL || 'http://localhost:3002',
        apiUrl: env.API_URL || `http://localhost:${process.env.PORT || 3001}`,
        corsOrigins: [
            env.WEB_URL || 'http://localhost:3002',
            ...(env.CORS_ORIGINS || '').split(',').map((value) => value.trim()).filter(Boolean),
        ],
        databaseUrl: requireString(env, 'DATABASE_URL'),
        redisUrl: optionalString(env, 'REDIS_URL') || 'redis://localhost:6379',
        ollama: {
            enabled: requireBoolean(env, 'OLLAMA_ENABLED'),
            baseUrl: optionalString(env, 'OLLAMA_BASE_URL') || 'http://127.0.0.1:11434',
            model: optionalString(env, 'OLLAMA_MODEL') || 'llama3.2:latest',
            embeddingModel: optionalString(env, 'OLLAMA_EMBEDDING_MODEL') || 'nomic-embed-text',
        },
        openai: {
            enabled: requireBoolean(env, 'OPENAI_ENABLED'),
            baseUrl: optionalString(env, 'OPENAI_BASE_URL') || 'https://api.openai.com/v1',
            model: optionalString(env, 'OPENAI_MODEL') || 'gpt-4o-mini',
            embeddingModel: optionalString(env, 'OPENAI_EMBEDDING_MODEL') || 'text-embedding-3-small',
            apiKey: optionalString(env, 'OPENAI_API_KEY'),
        },
        gemini: {
            enabled: requireBoolean(env, 'GEMINI_ENABLED'),
            model: optionalString(env, 'GEMINI_MODEL') || 'gemini-3.7-flash',
            embeddingModel: optionalString(env, 'GEMINI_EMBEDDING_MODEL') || 'text-embedding-004',
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
        research: {
            braveApiKey: optionalString(env, 'BRAVE_SEARCH_API_KEY'),
            maxSources: Number(env.RESEARCH_MAX_SOURCES || 6),
            maxCharactersPerSource: Number(env.RESEARCH_MAX_CHARS_PER_SOURCE || 6000),
            fetchTimeoutMs: Number(env.RESEARCH_FETCH_TIMEOUT_MS || 8000),
            // Private and loopback hosts stay blocked by default: research fetches are
            // server-side requests, and SSRF into the internal network is the threat.
            allowPrivateHosts: env.RESEARCH_ALLOW_PRIVATE_HOSTS === 'true',
        },
        files: {
            maxBytes: Number(env.FILES_MAX_BYTES || 10 * 1024 * 1024),
            maxFilesPerUser: Number(env.FILES_MAX_FILES_PER_USER || 200),
            maxTotalBytesPerUser: Number(env.FILES_MAX_TOTAL_BYTES_PER_USER || 200 * 1024 * 1024),
            chunkSize: Number(env.FILES_CHUNK_SIZE || 1200),
            chunkOverlap: Number(env.FILES_CHUNK_OVERLAP || 200),
            maxChunksPerFile: Number(env.FILES_MAX_CHUNKS_PER_FILE || 400),
            maxExtractedCharacters: Number(env.FILES_MAX_EXTRACTED_CHARS || 400_000),
            maxPreviewCharacters: Number(env.FILES_MAX_PREVIEW_CHARS || 20_000),
            searchCandidateLimit: Number(env.FILES_SEARCH_CANDIDATE_LIMIT || 5000),
            embeddingsEnabled: env.FILES_EMBEDDINGS_ENABLED !== 'false',
            embeddingsProvider: optionalString(env, 'FILES_EMBEDDINGS_PROVIDER') || 'auto',
            embeddingsModel: optionalString(env, 'FILES_EMBEDDINGS_MODEL'),
            minVectorSimilarity: Number(env.FILES_MIN_VECTOR_SIMILARITY || 0.55),
            minVectorMargin: Number(env.FILES_MIN_VECTOR_MARGIN || 0.06),
        },
        media: {
            maxPromptCharacters: Number(env.MEDIA_MAX_PROMPT_CHARS || 1000),
            maxImagesPerRequest: Number(env.MEDIA_MAX_IMAGES_PER_REQUEST || 4),
            maxAssetsPerUser: Number(env.MEDIA_MAX_ASSETS_PER_USER || 200),
            maxTotalBytesPerUser: Number(env.MEDIA_MAX_TOTAL_BYTES_PER_USER || 100 * 1024 * 1024),
            maxImageBytes: Number(env.MEDIA_MAX_IMAGE_BYTES || 20 * 1024 * 1024),
            aspectRatios: (env.MEDIA_ASPECT_RATIOS || '1:1,3:4,4:3,9:16,16:9')
                .split(',')
                .map((value) => value.trim())
                .filter(Boolean),
            generationsPerHour: Number(env.MEDIA_MAX_GENERATIONS_PER_HOUR || 20),
            video: {
                maxPromptCharacters: Number(env.MEDIA_VIDEO_MAX_PROMPT_CHARS || 1000),
                maxVideoBytes: Number(env.MEDIA_VIDEO_MAX_BYTES || 100 * 1024 * 1024),
                durations: (env.MEDIA_VIDEO_DURATIONS || '4,6,8')
                    .split(',')
                    .map((value) => Number(value.trim()))
                    .filter((value) => Number.isFinite(value)),
                aspectRatios: (env.MEDIA_VIDEO_ASPECT_RATIOS || '16:9,9:16,1:1')
                    .split(',')
                    .map((value) => value.trim())
                    .filter(Boolean),
                generationsPerHour: Number(env.MEDIA_VIDEO_GENERATIONS_PER_HOUR || 6),
                maxConcurrent: Number(env.MEDIA_VIDEO_MAX_CONCURRENT || 1),
            },
        },
        storage,
        features: {
            projects: booleanWithDefault(env, 'FEATURE_PROJECTS', false),
            files: booleanWithDefault(env, 'FEATURE_FILES', false),
            // On in development so the surface is reachable while it is being built,
            // and off in a production build unless it is asked for by name.
            codeWorkspace: booleanWithDefault(env, 'FEATURE_CODE_WORKSPACE', (env.NODE_ENV || 'development') !== 'production'),
        },
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
    if (!Number.isInteger(config.research.maxSources) || config.research.maxSources < 1 || config.research.maxSources > 20) {
        throw new Error(`RESEARCH_MAX_SOURCES must be an integer between 1 and 20, got "${env.RESEARCH_MAX_SOURCES}".`);
    }
    if (!Number.isInteger(config.research.maxCharactersPerSource) || config.research.maxCharactersPerSource < 200) {
        throw new Error(`RESEARCH_MAX_CHARS_PER_SOURCE must be an integer of at least 200, got "${env.RESEARCH_MAX_CHARS_PER_SOURCE}".`);
    }
    if (!Number.isInteger(config.research.fetchTimeoutMs) || config.research.fetchTimeoutMs < 500) {
        throw new Error(`RESEARCH_FETCH_TIMEOUT_MS must be an integer of at least 500, got "${env.RESEARCH_FETCH_TIMEOUT_MS}".`);
    }
    if (!Number.isInteger(config.files.maxBytes) || config.files.maxBytes < 1024) {
        throw new Error(`FILES_MAX_BYTES must be an integer of at least 1024, got "${env.FILES_MAX_BYTES}".`);
    }
    if (!Number.isInteger(config.files.maxFilesPerUser) || config.files.maxFilesPerUser < 1) {
        throw new Error(`FILES_MAX_FILES_PER_USER must be a positive integer, got "${env.FILES_MAX_FILES_PER_USER}".`);
    }
    if (!Number.isInteger(config.files.maxTotalBytesPerUser) || config.files.maxTotalBytesPerUser < config.files.maxBytes) {
        throw new Error(`FILES_MAX_TOTAL_BYTES_PER_USER must be an integer of at least FILES_MAX_BYTES, got "${env.FILES_MAX_TOTAL_BYTES_PER_USER}".`);
    }
    if (!Number.isInteger(config.files.chunkSize) || config.files.chunkSize < 200) {
        throw new Error(`FILES_CHUNK_SIZE must be an integer of at least 200, got "${env.FILES_CHUNK_SIZE}".`);
    }
    if (!Number.isInteger(config.files.chunkOverlap) || config.files.chunkOverlap < 0 || config.files.chunkOverlap >= config.files.chunkSize) {
        throw new Error(`FILES_CHUNK_OVERLAP must be an integer of at least 0 and below FILES_CHUNK_SIZE, got "${env.FILES_CHUNK_OVERLAP}".`);
    }
    if (!Number.isInteger(config.files.maxChunksPerFile) || config.files.maxChunksPerFile < 1) {
        throw new Error(`FILES_MAX_CHUNKS_PER_FILE must be a positive integer, got "${env.FILES_MAX_CHUNKS_PER_FILE}".`);
    }
    if (!Number.isInteger(config.files.maxExtractedCharacters) || config.files.maxExtractedCharacters < 1000) {
        throw new Error(`FILES_MAX_EXTRACTED_CHARS must be an integer of at least 1000, got "${env.FILES_MAX_EXTRACTED_CHARS}".`);
    }
    if (!Number.isInteger(config.files.searchCandidateLimit) || config.files.searchCandidateLimit < 50) {
        throw new Error(`FILES_SEARCH_CANDIDATE_LIMIT must be an integer of at least 50, got "${env.FILES_SEARCH_CANDIDATE_LIMIT}".`);
    }
    if (!['auto', 'ollama', 'gemini', 'openai'].includes(config.files.embeddingsProvider)) {
        throw new Error(`FILES_EMBEDDINGS_PROVIDER must be "auto", "ollama", "gemini" or "openai", got "${env.FILES_EMBEDDINGS_PROVIDER}".`);
    }
    if (config.files.minVectorSimilarity < 0 || config.files.minVectorSimilarity > 1) {
        throw new Error(`FILES_MIN_VECTOR_SIMILARITY must be between 0 and 1, got "${env.FILES_MIN_VECTOR_SIMILARITY}".`);
    }
    if (config.files.minVectorMargin < 0 || config.files.minVectorMargin > 1) {
        throw new Error(`FILES_MIN_VECTOR_MARGIN must be between 0 and 1, got "${env.FILES_MIN_VECTOR_MARGIN}".`);
    }
    if (!Number.isInteger(config.media.maxPromptCharacters) || config.media.maxPromptCharacters < 16) {
        throw new Error(`MEDIA_MAX_PROMPT_CHARS must be an integer of at least 16, got "${env.MEDIA_MAX_PROMPT_CHARS}".`);
    }
    if (!Number.isInteger(config.media.maxImagesPerRequest) || config.media.maxImagesPerRequest < 1 || config.media.maxImagesPerRequest > 8) {
        throw new Error(`MEDIA_MAX_IMAGES_PER_REQUEST must be an integer between 1 and 8, got "${env.MEDIA_MAX_IMAGES_PER_REQUEST}".`);
    }
    if (!Number.isInteger(config.media.maxAssetsPerUser) || config.media.maxAssetsPerUser < 1) {
        throw new Error(`MEDIA_MAX_ASSETS_PER_USER must be a positive integer, got "${env.MEDIA_MAX_ASSETS_PER_USER}".`);
    }
    if (!Number.isInteger(config.media.maxImageBytes) || config.media.maxImageBytes < 1024) {
        throw new Error(`MEDIA_MAX_IMAGE_BYTES must be an integer of at least 1024, got "${env.MEDIA_MAX_IMAGE_BYTES}".`);
    }
    if (!Number.isInteger(config.media.maxTotalBytesPerUser) ||
        config.media.maxTotalBytesPerUser < config.media.maxImageBytes) {
        throw new Error(`MEDIA_MAX_TOTAL_BYTES_PER_USER must be an integer of at least MEDIA_MAX_IMAGE_BYTES, got "${env.MEDIA_MAX_TOTAL_BYTES_PER_USER}".`);
    }
    if (config.media.aspectRatios.length === 0 ||
        config.media.aspectRatios.some((ratio) => !/^\d{1,2}:\d{1,2}$/.test(ratio))) {
        throw new Error(`MEDIA_ASPECT_RATIOS must be a comma-separated list of W:H values like "1:1,16:9", got "${env.MEDIA_ASPECT_RATIOS}".`);
    }
    if (!Number.isInteger(config.media.generationsPerHour) || config.media.generationsPerHour < 1) {
        throw new Error(`MEDIA_MAX_GENERATIONS_PER_HOUR must be a positive integer, got "${env.MEDIA_MAX_GENERATIONS_PER_HOUR}".`);
    }
    if (!Number.isInteger(config.media.video.maxPromptCharacters) || config.media.video.maxPromptCharacters < 16) {
        throw new Error(`MEDIA_VIDEO_MAX_PROMPT_CHARS must be an integer of at least 16, got "${env.MEDIA_VIDEO_MAX_PROMPT_CHARS}".`);
    }
    if (!Number.isInteger(config.media.video.maxVideoBytes) || config.media.video.maxVideoBytes < 1024) {
        throw new Error(`MEDIA_VIDEO_MAX_BYTES must be an integer of at least 1024, got "${env.MEDIA_VIDEO_MAX_BYTES}".`);
    }
    // 1..120 is the widest duration any configured video model accepts; offering a
    // length no renderer can produce would be a promise the API cannot keep.
    if (config.media.video.durations.length === 0 ||
        config.media.video.durations.some((seconds) => !Number.isInteger(seconds) || seconds < 1 || seconds > 120)) {
        throw new Error(`MEDIA_VIDEO_DURATIONS must be a comma-separated list of whole seconds between 1 and 120 like "4,6,8", got "${env.MEDIA_VIDEO_DURATIONS}".`);
    }
    if (config.media.video.aspectRatios.length === 0 ||
        config.media.video.aspectRatios.some((ratio) => !/^\d{1,2}:\d{1,2}$/.test(ratio))) {
        throw new Error(`MEDIA_VIDEO_ASPECT_RATIOS must be a comma-separated list of W:H values like "16:9,9:16", got "${env.MEDIA_VIDEO_ASPECT_RATIOS}".`);
    }
    if (!Number.isInteger(config.media.video.generationsPerHour) || config.media.video.generationsPerHour < 1) {
        throw new Error(`MEDIA_VIDEO_GENERATIONS_PER_HOUR must be a positive integer, got "${env.MEDIA_VIDEO_GENERATIONS_PER_HOUR}".`);
    }
    if (!Number.isInteger(config.media.video.maxConcurrent) || config.media.video.maxConcurrent < 1) {
        throw new Error(`MEDIA_VIDEO_MAX_CONCURRENT must be a positive integer, got "${env.MEDIA_VIDEO_MAX_CONCURRENT}".`);
    }
    cached = config;
    return config;
}
function ensureStorageRoots(config) {
    for (const dir of Object.values(config.storage)) {
        if (!(0, fs_1.existsSync)(dir)) {
            (0, fs_1.mkdirSync)(dir, { recursive: true });
        }
    }
}
//# sourceMappingURL=configuration.js.map