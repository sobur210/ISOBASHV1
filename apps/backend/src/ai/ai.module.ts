import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiProviderRegistry } from './provider.registry';
import { UnconfiguredAiProvider } from './unconfigured.provider';
import { OllamaProvider } from './ollama.provider';
import { AiModelRegistry } from './model.registry';
import { OpenAiProvider } from './openai.provider';
import { AiCapabilityRegistry } from './capability.registry';
import { AiToolsRegistry } from './tools.registry';

@Module({
  controllers: [AiController],
  providers: [
    AiProviderRegistry,
    OllamaProvider,
    OpenAiProvider,
    AiModelRegistry,
    AiCapabilityRegistry,
    AiToolsRegistry,
    {
      provide: 'AI_PROVIDER_REGISTRATION',
      inject: [AiProviderRegistry, AiModelRegistry, OllamaProvider, OpenAiProvider],
      useFactory: (registry: AiProviderRegistry, models: AiModelRegistry, ollama: OllamaProvider, openai: OpenAiProvider) => {
        if (process.env.OLLAMA_ENABLED === 'true') {
          registry.register(ollama);
          models.register({
            id: process.env.OLLAMA_MODEL || 'llama3.2:latest',
            provider: ollama.name,
            capabilities: ['language'],
            modes: ['offline', 'hybrid'],
            contextWindow: 131072,
          });
        }
        if (process.env.OPENAI_ENABLED === 'true') {
          registry.register(openai);
          models.register({
            id: process.env.OPENAI_MODEL || 'gpt-4o-mini',
            provider: openai.name,
            capabilities: ['language'],
            modes: ['online', 'hybrid'],
          });
        }
        if (registry.list().length === 0) registry.register(new UnconfiguredAiProvider());
        return true;
      },
    },
  ],
  exports: [AiProviderRegistry, AiModelRegistry, AiToolsRegistry],
})
export class AiModule {}
