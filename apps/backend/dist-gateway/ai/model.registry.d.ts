import { AiCapability, AiMode } from './provider.types';
export type AiModel = {
    id: string;
    provider: string;
    capabilities: AiCapability[];
    modes: AiMode[];
    contextWindow?: number;
    /**
     * Enabled models may be picked automatically by the Phase 9 router.
     * Aliases stay selectable by the user but are never chosen on their own, so
     * the configured primary model remains the default route.
     */
    enabled?: boolean;
    aliasOf?: string;
    /**
     * Operator preference baked into the router's score. Zero for almost every
     * model, so it never changes the existing text routing.
     *
     * It exists because health is a per-provider signal derived from *one*
     * capability: a Gemini image model is scored using Gemini's health, which is
     * a live call to its text model. If that text check is briefly unhealthy the
     * funded, higher-quality image renderer silently loses routing to a key-less
     * one purely because the latter always reports itself healthy. A registered
     * preference is the honest way to say "this key is funded for this capability",
     * and it is recorded in the route explanation rather than applied invisibly.
     *
     * Deliberately sized to outweigh health (20) and latency (25) noise but not a
     * genuine success-rate collapse, so a renderer that is actually failing can
     * still be overtaken and fail over.
     */
    priority?: number;
};
export declare class AiModelRegistry {
    private readonly models;
    register(model: AiModel): void;
    list(): AiModel[];
    get(id: string): AiModel | undefined;
    modelsFor(provider: string): AiModel[];
    find(capability: AiCapability, mode?: AiMode): AiModel[];
    /** Models the router is allowed to select automatically. */
    routable(capability: AiCapability, mode: AiMode): AiModel[];
}
