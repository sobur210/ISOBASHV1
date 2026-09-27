import { Injectable } from '@nestjs/common';
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
};

@Injectable()
export class AiModelRegistry {
  private readonly models = new Map<string, AiModel>();

  register(model: AiModel) {
    this.models.set(model.id, model);
  }

  list() {
    return [...this.models.values()];
  }

  get(id: string) {
    return this.models.get(id);
  }

  modelsFor(provider: string) {
    return this.list().filter((model) => model.provider === provider);
  }

  find(capability: AiCapability, mode: AiMode = 'hybrid') {
    return [...this.models.values()].filter(
      (model) => model.capabilities.includes(capability) && model.modes.includes(mode),
    );
  }

  /** Models the router is allowed to select automatically. */
  routable(capability: AiCapability, mode: AiMode) {
    return this.find(capability, mode).filter((model) => model.enabled !== false);
  }
}
