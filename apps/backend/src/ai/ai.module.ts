import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiProviderRegistry } from './provider.registry';
import { UnconfiguredAiProvider } from './unconfigured.provider';
import { OllamaProvider } from './ollama.provider';
import { AiModelRegistry } from './model.registry';
import { OpenAiProvider } from './openai.provider';
import { AiCapabilityRegistry } from './capability.registry';
import { AiToolsRegistry } from './tools.registry';
import { GeminiProvider } from './gemini.provider';

@Module({
  controllers: [AiController],
  providers: [
    AiProviderRegistry,
    OllamaProvider,
    OpenAiProvider,
    GeminiProvider,
    AiModelRegistry,
    AiCapabilityRegistry,
    AiToolsRegistry,
    {
      provide: 'AI_PROVIDER_REGISTRATION',
      inject: [AiProviderRegistry, AiModelRegistry, OllamaProvider, OpenAiProvider, GeminiProvider],
      useFactory: (
        registry: AiProviderRegistry,
        models: AiModelRegistry,
        ollama: OllamaProvider,
        openai: OpenAiProvider,
        gemini: GeminiProvider,
      ) => {
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
        if (process.env.GEMINI_ENABLED === 'true') {
          registry.register(gemini);
          models.register({
            id: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
            provider: gemini.name,
            capabilities: ['language'],
            modes: ['online', 'hybrid'],
            contextWindow: 1048576,
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
