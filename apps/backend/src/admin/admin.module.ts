import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminGuard } from '../auth/admin.guard';
import { QueueModule } from '../queues/queue.module';
import { AdminController } from './admin.controller';
import { SystemHealthService } from './system-health.service';

@Module({
  imports: [AuthModule, QueueModule],
  controllers: [AdminController],
  providers: [SystemHealthService, AdminGuard],
})
export class AdminModule {}