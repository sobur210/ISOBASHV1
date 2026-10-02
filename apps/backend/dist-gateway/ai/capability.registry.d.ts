import { AiCapability } from './provider.types';
export type CapabilityStatus = {
    capability: AiCapability;
    status: 'available' | 'unavailable';
    providers: string[];
    detail: string;
};
export declare class AiCapabilityRegistry {
    private readonly capabilities;
    list(providerCapabilities: Map<string, readonly AiCapability[]>): CapabilityStatus[];
}
