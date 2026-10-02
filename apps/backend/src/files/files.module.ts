import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { SecurityModule } from '../security/security.module';
import { ConfigModule } from '../shared/config/config.module';
import { StorageModule } from '../shared/storage/storage.module';
import { DocumentExtractorService } from './document-extractor.service';
import { EmbeddingService } from './embedding.service';
import { FileProcessorService } from './file-processor.service';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { KnowledgeController } from './knowledge.controller';
import { KnowledgeService } from './knowledge.service';

@Module({
  // RealtimeModule is @Global, so RealtimeService is available without importing it.
  imports: [AuthModule, AiModule, BillingModule, ConfigModule, SecurityModule, StorageModule],
  controllers: [FilesController, KnowledgeController],
  providers: [FilesService, FileProcessorService, DocumentExtractorService, EmbeddingService, KnowledgeService],
  exports: [FilesService, KnowledgeService, EmbeddingService],
})
export class FilesModule {}
