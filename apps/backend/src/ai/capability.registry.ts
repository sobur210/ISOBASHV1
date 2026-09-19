import { Injectable } from '@nestjs/common';
import { AiCapability } from './provider.types';

export type CapabilityStatus = {
  capability: AiCapability;
  status: 'available' | 'unavailable';
  providers: string[];
  detail: string;
};

@Injectable()
export class AiCapabilityRegistry {
  private readonly capabilities: AiCapability[] = [
    'language',
    'vision',
    'embeddings',
    'image-generation',
    'video-generation',
    'research',
  ];

  list(providerCapabilities: Map<string, readonly AiCapability[]>): CapabilityStatus[] {
    return this.capabilities.map((capability) => {
      const providers = [...providerCapabilities.entries()]
        .filter(([, capabilities]) => capabilities.includes(capability))
        .map(([provider]) => provider);
      return {
        capability,
        status: providers.length > 0 ? 'available' : 'unavailable',
        providers,
        detail: providers.length > 0
          ? `Available through ${providers.join(', ')}.`
          : 'No configured provider currently supports this capability.',
      };
    });
  }
}
