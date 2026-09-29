import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../auth/auth.module';
import { MemoryModule } from '../memory/memory.module';
import { SecurityModule } from '../security/security.module';
import { ConfigModule } from '../shared/config/config.module';
import { ResearchController } from './research.controller';
import { ResearchService } from './research.service';
import { SearchService } from './search.service';
import { WebRetrievalService } from './web-retrieval.service';

@Module({
  imports: [AuthModule, AiModule, ConfigModule, MemoryModule, SecurityModule],
  controllers: [ResearchController],
  providers: [ResearchService, SearchService, WebRetrievalService],
  exports: [ResearchService, WebRetrievalService],
})
export class ResearchModule {}
