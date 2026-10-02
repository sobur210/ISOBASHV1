import { AiProviderRegistry } from './provider.registry';
import { AiModelRegistry } from './model.registry';
import { AiCapabilityRegistry } from './capability.registry';
import { AiToolsRegistry } from './tools.registry';
import { AiRouterService } from './ai-router.service';
import { ProviderHealthService } from './provider-health.service';
import { GenerateRequestDto } from './dto/generate-request.dto';
import { RoutePreviewDto } from './dto/route-preview.dto';
export declare class AiController {
    private readonly registry;
    private readonly models;
    private readonly capabilities;
    private readonly tools;
    private readonly router;
    private readonly health;
    constructor(registry: AiProviderRegistry, models: AiModelRegistry, capabilities: AiCapabilityRegistry, tools: AiToolsRegistry, router: AiRouterService, health: ProviderHealthService);
    listProviders(): import("./provider.types").AiProviderHealth[];
    getProviderHealth(): Promise<{
        runtime: import("./routing.types").ProviderRuntimeStats | null;
        provider: string;
        status: "healthy" | "unconfigured" | "unavailable";
        capabilities: import("./provider.types").AiCapability[];
        detail?: string;
    }[]>;
    listModels(): import("./model.registry").AiModel[];
    listCapabilities(): import("./capability.registry").CapabilityStatus[];
    listTools(): import("./tools.registry").AiToolDefinition[];
    /** Phase 9: live routing table of health, circuit state, reliability and latency. */
    routingTable(): Promise<{
        defaultMode: import("./provider.types").AiMode;
        providers: import("./routing.types").ProviderRuntimeStats[];
        models: {
            autoSelectable: boolean;
            id: string;
            provider: string;
            capabilities: import("./provider.types").AiCapability[];
            modes: import("./provider.types").AiMode[];
            contextWindow?: number;
            enabled?: boolean;
            aliasOf?: string;
            priority?: number;
        }[];
        policy: {
            failoverAllowed: string[];
            failoverBlocked: string[];
            note: string;
        };
    }>;
    /** Phase 9: preview a routing decision without executing a model call. */
    previewRoute(request: RoutePreviewDto): Promise<import("./routing.types").RoutePlan>;
    routingPreview(capability?: string, mode?: string, model?: string): Promise<import("./routing.types").RoutePlan>;
    generate(request: GenerateRequestDto): Promise<import("./provider.types").AiResponse>;
}
