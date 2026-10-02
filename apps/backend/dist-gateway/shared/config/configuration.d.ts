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
    /**
     * Exact browser origins allowed to call the API with credentials. Reflecting
     * any origin would let a page on any site ride the session cookie, so the
     * list is explicit: WEB_URL plus anything CORS_ORIGINS adds.
     */
    corsOrigins: string[];
    databaseUrl: string;
    redisUrl: string;
    ollama: {
        enabled: boolean;
        baseUrl: string;
        model: string;
        embeddingModel: string;
    };
    openai: {
        enabled: boolean;
        baseUrl: string;
        model: string;
        embeddingModel: string;
        apiKey?: string;
    };
    gemini: {
        enabled: boolean;
        model: string;
        embeddingModel: string;
        apiKey?: string;
    };
    media: {
        maxPromptCharacters: number;
        maxImagesPerRequest: number;
        maxAssetsPerUser: number;
        maxTotalBytesPerUser: number;
        maxImageBytes: number;
        /** Aspect ratios the API accepts. Anything else is refused rather than coerced. */
        aspectRatios: string[];
        /** Generations started per account per hour, on top of the per-IP rate limit. */
        generationsPerHour: number;
        /**
         * Phase 14 video generation. Kept separate from the image limits because a
         * clip is two orders of magnitude larger than a still and takes minutes, not
         * seconds, to render.
         */
        video: {
            maxPromptCharacters: number;
            maxVideoBytes: number;
            /** Durations in whole seconds the API accepts; anything else is refused. */
            durations: number[];
            aspectRatios: string[];
            /** Video runs started per account per hour. */
            generationsPerHour: number;
            /** Video renders in flight at once for the whole process. */
            maxConcurrent: number;
        };
    };
    security: {
        appSecret: string;
        authRateLimit: {
            limit: number;
            windowMs: number;
        };
        registerRateLimit: {
            limit: number;
            windowMs: number;
        };
        mfaRateLimit: {
            limit: number;
            windowMs: number;
        };
        loginFailuresPerAccount: {
            limit: number;
            windowMs: number;
        };
    };
    research: {
        braveApiKey?: string;
        maxSources: number;
        maxCharactersPerSource: number;
        fetchTimeoutMs: number;
        allowPrivateHosts: boolean;
    };
    files: {
        maxBytes: number;
        maxFilesPerUser: number;
        maxTotalBytesPerUser: number;
        chunkSize: number;
        chunkOverlap: number;
        maxChunksPerFile: number;
        maxExtractedCharacters: number;
        maxPreviewCharacters: number;
        searchCandidateLimit: number;
        embeddingsEnabled: boolean;
        /** `auto` asks the router for any embedding model; a provider name pins it. */
        embeddingsProvider: string;
        embeddingsModel?: string;
        /** Cosine floor below which a dense hit is treated as noise. */
        minVectorSimilarity: number;
        /** How far the best chunk must lead the rest for vector hits to count. */
        minVectorMargin: number;
    };
    storage: StorageRoots;
    /**
     * Phase 1. Read by `FeatureGuard`, which is the only thing that refuses a
     * route. Projects and Files default off: they are being retired in favour of
     * the Code Workspace, and the tables stay for the records that reference them.
     */
    features: {
        projects: boolean;
        files: boolean;
        codeWorkspace: boolean;
    };
    env: string;
};
export declare function resolveEnvFile(): string | undefined;
export declare function loadConfig(env?: NodeJS.ProcessEnv): AppConfig;
export declare function ensureStorageRoots(config: AppConfig): void;
