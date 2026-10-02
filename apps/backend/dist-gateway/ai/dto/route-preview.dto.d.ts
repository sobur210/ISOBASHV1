import { AiCapability, AiMode } from '../provider.types';
/** Phase 9: ask the router what it would do, without spending a model call. */
export declare class RoutePreviewDto {
    capability: AiCapability;
    mode?: AiMode;
    model?: string;
}
