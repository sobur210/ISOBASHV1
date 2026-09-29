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
import { PollinationsProvider } from './pollinations.provider';
import { ProviderHealthService } from './provider-health.service';
import { AiRouterService } from './ai-router.service';
import { SecurityModule } from '../security/security.module';

@Module({
  imports: [SecurityModule],
  controllers: [AiController],
  providers: [
    AiProviderRegistry,
    ProviderHealthService,
    AiRouterService,
    OllamaProvider,
    OpenAiProvider,
    GeminiProvider,
    PollinationsProvider,
    AiModelRegistry,
    AiCapabilityRegistry,
    AiToolsRegistry,
    {
      provide: 'AI_PROVIDER_REGISTRATION',
      inject: [AiProviderRegistry, AiModelRegistry, OllamaProvider, OpenAiProvider, GeminiProvider, PollinationsProvider],
      useFactory: (
        registry: AiProviderRegistry,
        models: AiModelRegistry,
        ollama: OllamaProvider,
        openai: OpenAiProvider,
        gemini: GeminiProvider,
        pollinations: PollinationsProvider,
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
          // The embedding model is only usable once it is actually pulled, so it is
          // registered but never auto-selected: `ollama pull` is a deliberate act.
          models.register({
            id: process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text',
            provider: ollama.name,
            capabilities: ['embeddings'],
            modes: ['offline', 'hybrid'],
            contextWindow: 8192,
            enabled: false,
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
          models.register({
            id: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
            provider: openai.name,
            capabilities: ['embeddings'],
            modes: ['online', 'hybrid'],
            contextWindow: 8191,
          });
          if (openai.capabilities.includes('image-generation')) {
            models.register({
              id: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1',
              provider: openai.name,
              capabilities: ['image-generation'],
              modes: ['online', 'hybrid'],
              enabled: true,
            });
          }
        }
        if (process.env.GEMINI_ENABLED === 'true') {
          registry.register(gemini);
          const geminiModel = process.env.GEMINI_MODEL || 'gemini-3.7-flash';
          models.register({
            id: geminiModel,
            provider: gemini.name,
            capabilities: ['language'],
            modes: ['online', 'hybrid'],
            contextWindow: 1048576,
            enabled: true,
          });
          for (const alias of ['gemini-3.6-flash', 'gemini-flash-latest']) {
            if (alias === geminiModel) continue;
            models.register({
              id: alias,
              provider: gemini.name,
              capabilities: ['language'],
              modes: ['online', 'hybrid'],
              contextWindow: 1048576,
              enabled: false,
              aliasOf: geminiModel,
            });
          }
          models.register({
            id: process.env.GEMINI_EMBEDDING_MODEL || 'text-embedding-004',
            provider: gemini.name,
            capabilities: ['embeddings'],
            modes: ['online', 'hybrid'],
            contextWindow: 2048,
          });
          if (gemini.capabilities.includes('image-generation')) {
            // Image models are registered only when the adapter really advertises the
            // capability, so /ai/capabilities cannot offer a provider that is off.
            const imageModel = process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image';
            models.register({
              id: imageModel,
              provider: gemini.name,
              capabilities: ['image-generation'],
              modes: ['online', 'hybrid'],
              enabled: true,
            });
            for (const alias of ['gemini-3.1-flash-lite-image', 'gemini-3.1-flash-image-preview', 'gemini-2.5-flash-image']) {
              if (alias === imageModel) continue;
              models.register({
                id: alias,
                provider: gemini.name,
                capabilities: ['image-generation'],
                modes: ['online', 'hybrid'],
                enabled: false,
                aliasOf: imageModel,
              });
            }
          }
        }
        if (process.env.POLLINATIONS_ENABLED === 'true') {
          // A key-less public image endpoint. It is registered only when asked for,
          // so a deployment that has a paying image provider does not quietly gain a
          // free third party that renders prompts it did not choose to send.
          registry.register(pollinations);
          models.register({
            id: process.env.POLLINATIONS_MODEL || 'flux',
            provider: pollinations.name,
            capabilities: ['image-generation'],
            modes: ['online'],
            enabled: true,
          });
        }
        if (registry.list().length === 0) registry.register(new UnconfiguredAiProvider());
        return true;
      },
    },
  ],
  exports: [AiProviderRegistry, AiModelRegistry, AiToolsRegistry, ProviderHealthService, AiRouterService],
})
export class AiModule {}
