import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { QueueModule } from '../queues/queue.module';
import { AdminController } from './admin.controller';
import { AdminUsersService } from './admin-users.service';
import { SystemHealthService } from './system-health.service';

@Module({
  imports: [AuthModule, QueueModule],
  controllers: [AdminController],
  providers: [SystemHealthService, AdminUsersService],
})
export class AdminModule {}
