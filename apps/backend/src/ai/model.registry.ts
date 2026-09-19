import { Injectable } from '@nestjs/common';
import { AiCapability, AiMode } from './provider.types';

export type AiModel = {
  id: string;
  provider: string;
  capabilities: AiCapability[];
  modes: AiMode[];
  contextWindow?: number;
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

  find(capability: AiCapability, mode: AiMode = 'hybrid') {
    return [...this.models.values()].filter(
      (model) => model.capabilities.includes(capability) && model.modes.includes(mode),
    );
  }
}
