import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AiModule } from '../ai/ai.module';
import { QueueModule } from '../queues/queue.module';
import { AdminController } from './admin.controller';
import { AdminUsersService } from './admin-users.service';
import { SystemHealthService } from './system-health.service';

@Module({
  // AiModule for the credit pool summary. It is a read of a shared budget, so it
  // belongs to the AI module that meters it rather than to a local copy here.
  imports: [AuthModule, QueueModule, AiModule],
  controllers: [AdminController],
  providers: [SystemHealthService, AdminUsersService],
})
export class AdminModule {}
