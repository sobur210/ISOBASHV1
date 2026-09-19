import { Body, Controller, Get, Post } from '@nestjs/common';
import { AiProviderRegistry } from './provider.registry';
import { AiModelRegistry } from './model.registry';
import { AiCapabilityRegistry } from './capability.registry';

@Controller('ai')
export class AiController {
  constructor(
    private readonly registry: AiProviderRegistry,
    private readonly models: AiModelRegistry,
    private readonly capabilities: AiCapabilityRegistry,
  ) {}

  @Get('providers')
  listProviders() {
    return this.registry.list();
  }

  @Get('providers/health')
  getProviderHealth() {
    return this.registry.health();
  }

  @Get('models')
  listModels() {
    return this.models.list();
  }

  @Get('capabilities')
  listCapabilities() {
    return this.capabilities.list(this.registry.capabilities());
  }

  @Post('generate')
  generate(@Body() request: { capability: 'language'; input: string; model?: string }) {
    return this.registry.execute(request);
  }
}
