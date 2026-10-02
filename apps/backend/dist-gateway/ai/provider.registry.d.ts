import { AiCapability, AiProvider, AiProviderHealth, AiRequest, AiResponse, AiStreamChunk } from './provider.types';
export declare class AiProviderRegistry {
    private readonly providers;
    register(provider: AiProvider): void;
    instance(name: string): AiProvider | undefined;
    names(): string[];
    list(): AiProviderHealth[];
    capabilities(): Map<string, readonly AiCapability[]>;
    health(): Promise<AiProviderHealth[]>;
    execute(request: AiRequest): Promise<AiResponse>;
    private findProviders;
    stream(request: AiRequest, signal?: AbortSignal): AsyncGenerator<AiStreamChunk>;
}
