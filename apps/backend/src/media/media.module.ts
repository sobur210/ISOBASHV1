import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../auth/auth.module';
import { SecurityModule } from '../security/security.module';
import { ConfigModule } from '../shared/config/config.module';
import { StorageModule } from '../shared/storage/storage.module';
import { ImageGenerationService } from './image-generation.service';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';

@Module({
  // RealtimeModule is @Global, so RealtimeService is available without importing it.
  imports: [AuthModule, AiModule, ConfigModule, SecurityModule, StorageModule],
  controllers: [MediaController],
  providers: [MediaService, ImageGenerationService],
  exports: [MediaService, ImageGenerationService],
})
export class MediaModule {}
