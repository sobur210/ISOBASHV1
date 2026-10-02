import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SecurityModule } from '../security/security.module';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { EntitlementsService } from './entitlements.service';

@Module({
  // AuthModule supplies AuthService for AuthGuard; SecurityModule supplies
  // AuditService for the plan-change trail.
  imports: [AuthModule, SecurityModule],
  controllers: [BillingController],
  providers: [BillingService, EntitlementsService],
  // EntitlementsService is exported because the files and media quota checks read
  // it: a plan is enforced by the services that already enforce a quota, not by a
  // check that only exists on the billing page.
  exports: [BillingService, EntitlementsService],
})
export class BillingModule {}