import { Body, Controller, Get, Post, Query, UsePipes, ValidationPipe } from '@nestjs/common';
import { AiProviderRegistry } from './provider.registry';
import { AiModelRegistry } from './model.registry';
import { AiCapabilityRegistry } from './capability.registry';
import { AiToolsRegistry } from './tools.registry';
import { AiRouterService } from './ai-router.service';
import { ProviderHealthService } from './provider-health.service';
import { GenerateRequestDto } from './dto/generate-request.dto';
import { RoutePreviewDto } from './dto/route-preview.dto';

@Controller('ai')
export class AiController {
  constructor(
    private readonly registry: AiProviderRegistry,
    private readonly models: AiModelRegistry,
    private readonly capabilities: AiCapabilityRegistry,
    private readonly tools: AiToolsRegistry,
    private readonly router: AiRouterService,
    private readonly health: ProviderHealthService,
  ) {}

  @Get('providers')
  listProviders() {
    return this.registry.list();
  }

  @Get('providers/health')
  async getProviderHealth() {
    const live = await this.registry.health();
    const stats = new Map((await this.health.snapshotWithHealth()).map((entry) => [entry.provider, entry]));
    return live.map((entry) => ({ ...entry, runtime: stats.get(entry.provider) ?? null }));
  }

  @Get('models')
  listModels() {
    return this.models.list();
  }

  @Get('capabilities')
  listCapabilities() {
    return this.capabilities.list(this.registry.capabilities());
  }

  @Get('tools')
  listTools() {
    return this.tools.list();
  }

  /** Phase 9: live routing table of health, circuit state, reliability and latency. */
  @Get('routing')
  async routingTable() {
    return {
      defaultMode: this.router.mode(),
      providers: await this.health.snapshotWithHealth(),
      models: this.models.list().map((model) => ({ ...model, autoSelectable: model.enabled !== false })),
      policy: {
        failoverAllowed: ['PROVIDER_UNAVAILABLE', 'PROVIDER_STREAM_FAILED', 'EMPTY_PROVIDER_RESPONSE', 'PROVIDER_TIMEOUT', 'STREAM_INTERRUPTED'],
        failoverBlocked: ['RATE_LIMITED', 'INVALID_API_KEY', 'PROVIDER_NOT_CONFIGURED', 'MODEL_NOT_AVAILABLE', 'PROVIDER_OVERLOADED', 'CAPABILITY_UNSUPPORTED'],
        note: 'An explicit provider selection is always strict: no cross-provider fallback. Provider errors that are real answers are surfaced verbatim.',
      },
    };
  }

  /** Phase 9: preview a routing decision without executing a model call. */
  @Post('route')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false }))
  async previewRoute(@Body() request: RoutePreviewDto) {
    return this.router.plan({ capability: request.capability, mode: request.mode, model: request.model });
  }

  @Get('route')
  routingPreview(
    @Query('capability') capability?: string,
    @Query('mode') mode?: string,
    @Query('model') model?: string,
  ) {
    return this.router.plan({
      capability: (capability as never) ?? 'language',
      mode: mode as never,
      model,
    });
  }

  @Post('generate')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false }))
  generate(@Body() request: GenerateRequestDto) {
    return this.router.execute(request);
  }
}
