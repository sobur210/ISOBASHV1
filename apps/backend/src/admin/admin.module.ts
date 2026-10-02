import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AiModule } from '../ai/ai.module';
import { QueueModule } from '../queues/queue.module';
import { BillingModule } from '../billing/billing.module';
import { AdminController } from './admin.controller';
import { AdminUsersService } from './admin-users.service';
import { AdminSettingsService } from './admin-settings.service';
import { AdminShellService } from './admin-shell.service';
import { SystemHealthService } from './system-health.service';

@Module({
  // AiModule for the credit pool summary. It is a read of a shared budget, so it
  // belongs to the AI module that meters it rather than to a local copy here.
  // BillingModule for the one path that grants a plan.
  imports: [AuthModule, QueueModule, AiModule, BillingModule],
  controllers: [AdminController],
  providers: [SystemHealthService, AdminUsersService, AdminSettingsService, AdminShellService],
})
export class AdminModule {}