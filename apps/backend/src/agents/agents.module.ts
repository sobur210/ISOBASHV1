import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../auth/auth.module';
import { MemoryModule } from '../memory/memory.module';
import { SecurityModule } from '../security/security.module';
import { AgentRunnerService } from './agent-runner.service';
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';

@Module({
  imports: [AuthModule, AiModule, MemoryModule, SecurityModule],
  controllers: [AgentsController],
  providers: [AgentsService, AgentRunnerService],
  exports: [AgentsService],
})
export class AgentsModule {}
