import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../auth/auth.module';
import { SecurityModule } from '../security/security.module';
import { QueueModule } from '../queues/queue.module';
import { ConfigModule } from '../shared/config/config.module';
import { StorageModule } from '../shared/storage/storage.module';
import { ImageGenerationService } from './image-generation.service';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { PromptComposerService } from './prompt-composer.service';
import { VideoGenerationService } from './video-generation.service';
import { VideoRenderQueue } from './video-render.queue';

@Module({
  // RealtimeModule is @Global, so RealtimeService is available without importing it.
  imports: [AuthModule, AiModule, ConfigModule, SecurityModule, StorageModule, QueueModule],
  controllers: [MediaController],
  providers: [MediaService, ImageGenerationService, VideoGenerationService, PromptComposerService, VideoRenderQueue],
  exports: [MediaService, ImageGenerationService, VideoGenerationService],
})
export class MediaModule {}
