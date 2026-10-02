import { Controller, Delete, Get, HttpCode, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionUser } from '../auth/session.model';
import { BillingService } from './billing.service';

@Controller('billing')
@UseGuards(AuthGuard)
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  /**
   * Public to any signed-in account, and safe to call without one: it describes
   * the deployment, not the caller. There is deliberately no `paymentMethods`
   * array here, because there is no processor to hold one.
   */
  @Get('capabilities')
  capabilities() {
    return this.billing.capabilities();
  }

  @Get('subscription')
  subscription(@CurrentUser() user: SessionUser) {
    return this.billing.subscription(user.id);
  }

  @Get('usage')
  usage(@CurrentUser() user: SessionUser) {
    return this.billing.usage(user.id);
  }

  /**
   * Returning to the Free plan is the one billing action a user can take. It is
   * `DELETE` on purpose: the account stops holding an entitlement, which is what
   * removing the row means. Upgrading is not exposed here at all — see
   * `capabilities().selfService`.
   */
  @HttpCode(200)
  @Delete('subscription')
  downgrade(@CurrentUser() user: SessionUser) {
    return this.billing.downgrade(user);
  }
}