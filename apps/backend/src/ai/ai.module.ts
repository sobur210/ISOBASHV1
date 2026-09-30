import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { ProviderCreditService } from './provider-credit.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AiProviderRegistry } from './provider.registry';
import { UnconfiguredAiProvider } from './unconfigured.provider';
import { OllamaProvider } from './ollama.provider';
import { AiModelRegistry } from './model.registry';
import { OpenAiProvider } from './openai.provider';
import { AiCapabilityRegistry } from './capability.registry';
import { AiToolsRegistry } from './tools.registry';
import { GeminiProvider } from './gemini.provider';
import { PollinationsProvider } from './pollinations.provider';
import { PollinationsVideoProvider } from './pollinations-video.provider';
import { MagicHourVideoProvider } from './magic-hour-video.provider';
import { DeepAiVideoProvider } from './deepai-video.provider';
import { DeepAiImageProvider } from './deepai-image.provider';
import { DEEPAI_IMAGE_MODEL, DEEPAI_VIDEO_MODEL } from './deepai.pricing';
import { ProviderHealthService } from './provider-health.service';
import { AiRouterService } from './ai-router.service';
import { SecurityModule } from '../security/security.module';

@Module({
  imports: [SecurityModule, PrismaModule],
  controllers: [AiController],
  providers: [
    AiProviderRegistry,
    ProviderHealthService,
    AiRouterService,
    ProviderCreditService,
    OllamaProvider,
    OpenAiProvider,
    GeminiProvider,
    PollinationsProvider,
    PollinationsVideoProvider,
    MagicHourVideoProvider,
    DeepAiVideoProvider,
    DeepAiImageProvider,
    AiModelRegistry,
    AiCapabilityRegistry,
    AiToolsRegistry,
    {
      provide: 'AI_PROVIDER_REGISTRATION',
      inject: [AiProviderRegistry, AiModelRegistry, OllamaProvider, OpenAiProvider, GeminiProvider, PollinationsProvider, PollinationsVideoProvider, MagicHourVideoProvider, DeepAiVideoProvider, DeepAiImageProvider],
      useFactory: (
        registry: AiProviderRegistry,
        models: AiModelRegistry,
        ollama: OllamaProvider,
        openai: OpenAiProvider,
        gemini: GeminiProvider,
        pollinations: PollinationsProvider,
        pollinationsVideo: PollinationsVideoProvider,
        magicHour: MagicHourVideoProvider,
        deepAiVideo: DeepAiVideoProvider,
        deepAiImage: DeepAiImageProvider,
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
            //
            // Gemini is auto-selected for images only when the key is funded
            // (`GEMINI_IMAGE_BILLING_ENABLED=true`). Google's free tier grants
            // *zero* image quota: a free key can list these models and still never
            // render one. Auto-selecting an unfunded key makes every image pay a
            // 429 round trip before the funded renderer is reached, and the refusal
            // would then be reported instead of the picture. So when it is not
            // funded the model stays registered and manually selectable (pin
            // `gemini:<model>`) but the router prefers the renderer that can pay.
            const imageModel = process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image';
            const geminiImageFunded = process.env.GEMINI_IMAGE_BILLING_ENABLED === 'true';
            models.register({
              id: imageModel,
              provider: gemini.name,
              capabilities: ['image-generation'],
              modes: ['online', 'hybrid'],
              enabled: geminiImageFunded,
              // Funding the key is an explicit instruction to prefer this renderer
              // for images. Without it the key-less endpoint would usually win on a
              // score tie that only happens while Gemini's *text* health check also
              // happens to be green, which is not a promise anyone should rely on.
              priority: geminiImageFunded ? 50 : 0,
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
        if (process.env.POLLINATIONS_VIDEO_ENABLED === 'true') {
          /**
           * Video is opt-in and separate from the image renderer because every
           * Pollinations generation endpoint now needs a key, so it cannot share the
           * anonymous image adapter. Registering the provider without a key is
           * deliberate: `/ai/capabilities` then reports the video capability as
           * available-but-unconfigured rather than silently omitting it.
           */
          registry.register(pollinationsVideo);
          const videoModel = process.env.POLLINATIONS_VIDEO_MODEL || 'google/veo-3.1-fast';
          models.register({
            id: videoModel,
            provider: pollinationsVideo.name,
            capabilities: ['video-generation'],
            modes: ['online'],
            enabled: true,
          });
        }
        if (process.env.MAGICHOUR_ENABLED === 'true') {
          /**
           * Magic Hour is registered on the same key-gated basis as every other
           * provider, and for a sharper reason: this one account pays for every
           * ISOBASH user. A misconfigured key here does not degrade one user's
           * renders, it drains a pool that all of them share, so the adapter
           * reports `unconfigured` rather than being quietly omitted.
           *
           * The models registered are the ones the adapter will accept, which on
           * the free plan is only `ltx-2.5` and `minimax-h3`; asking a free key for
           * Veo is a provider error, so it must not be offered in the first place.
           *
           * Priority is above the other video renderers because a Magic Hour
           * render is one the operator has actually budgeted for and can account
           * for in `MagicHourPoolService`. When it is disabled, the router falls
           * back to the remaining renderers as before.
           */
          registry.register(magicHour);
          for (const videoModel of magicHour.enabledModels) {
            models.register({
              id: videoModel,
              provider: magicHour.name,
              capabilities: ['video-generation'],
              modes: ['online'],
              enabled: true,
              priority: 60,
            });
          }
        }
        if (process.env.DEEPAI_ENABLED === 'true') {
          /**
           * DeepAI is registered as one provider serving two capabilities, because
           * one key covers both and one subscription unlocks both.
           *
           * The adapter is registered even without a key, for the same reason
           * Magic Hour's is: a key that exists but has no active Pro subscription is
           * a configuration problem the operator needs to see, not a provider that
           * should silently vanish from `/ai/capabilities`.
           *
           * VIDEO IS NOT ROUTED YET, ON PURPOSE.
           *
           * The video model is registered with `enabled: false` and no priority, so
           * it appears in the model list but the router will not select it on its
           * own. Turning it on is task 5 (choosing between AI video providers by
           * remaining quota or a configured order), which is being written
           * separately; registering it as an equal-priority candidate now would let
           * the router pick a provider that charges $0.20/second from a 25-second
           * monthly pool with nothing deciding when that pool is spent.
           *
           * IMAGE, CONTRAST
           *
           * Image routing already exists and needed no new decision, so the image
           * model is registered enabled rather than blocked on the same task. It is
           * still not free, which is why it is low priority and has its own switch.
           */
          registry.register(deepAiVideo);
          models.register({
            id: DEEPAI_VIDEO_MODEL,
            provider: deepAiVideo.name,
            capabilities: ['video-generation'],
            modes: ['online'],
            enabled: false,
          });
          /**
           * Image registration is separate because image and video cost money in
           * different ways, and an operator may want one without the other. The
           * image model defaults on with `DEEPAI_ENABLED` and can be turned off on
           * its own, so enabling video registration does not also switch on a
           * per-call billing path nobody asked for.
           *
           * It is registered at a LOW priority on purpose: a DeepAI image costs a
           * credit per call and is never free, so it must not outrank Gemini or a
           * deliberately enabled Pollinations just by being registered.
           */
          if (process.env.DEEPAI_IMAGE_ENABLED !== 'false') {
            registry.register(deepAiImage);
            models.register({
              id: DEEPAI_IMAGE_MODEL,
              provider: deepAiImage.name,
              capabilities: ['image-generation'],
              modes: ['online'],
              enabled: true,
              priority: 10,
            });
          }
        }
        if (registry.list().length === 0) registry.register(new UnconfiguredAiProvider());
        return true;
      },
    },
  ],
  exports: [AiProviderRegistry, AiModelRegistry, AiToolsRegistry, ProviderHealthService, AiRouterService, ProviderCreditService],
})
export class AiModule {}
