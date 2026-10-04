import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionUser } from '../auth/session.model';
import { RateLimit, RateLimitGuard } from '../security/rate-limit.guard';
import { AuditService } from '../security/audit.service';
import { AdminUsersService } from './admin-users.service';
import { ListUsersQueryDto, UpdateUserRoleDto } from './dto/admin-user.dto';
import { SystemHealthService } from './system-health.service';
import { AdminSettingsService } from './admin-settings.service';
import { ProviderCreditService } from '../ai/provider-credit.service';
import { BillingService } from '../billing/billing.service';
import { ChangePlanDto } from '../billing/dto/billing.dto';
import { AdminShellService } from './admin-shell.service';

// Authorization is decided here and by RolesGuard, never by the client. The
// frontend only renders what this surface returns.
@UseGuards(AuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly systemHealth: SystemHealthService,
    private readonly users: AdminUsersService,
    private readonly audit: AuditService,
    private readonly credits: ProviderCreditService,
    private readonly settings: AdminSettingsService,
    private readonly billing: BillingService,
    private readonly shell: AdminShellService,
  ) {}

  @Get('system-health')
  getSystemHealth() {
    return this.systemHealth.checkAll();
  }

  /**
   * Phase 17 admin center: live counts for the overview. Every figure is an
   * aggregate over the same tables the product surfaces read, so the console and
   * the workspace cannot disagree.
   */
  @Get('overview')
  overview() {
    return this.settings.overview();
  }

  /**
   * Phase 17: what this deployment is configured to do, with every secret
   * reduced to a boolean. Read-only on purpose — see `AdminSettingsService`.
   *
   * Named `configuration`, not `settings`, because `/admin/settings` is a
   * frontend page route. The gateway forwards unmatched paths to the API with an
   * `afterFiles` rewrite, and `afterFiles` is evaluated *after* the filesystem,
   * so a page at the same path would be served instead of this handler and the
   * admin console would silently receive HTML where it expected JSON.
   * `scripts/check-route-collisions.mjs` fails the build if that ever recurs.
   */
  @Get('configuration')
  settingsView() {
    return this.settings.settings();
  }

  /**
   * The shared video credit pool, month to date.
   *
   * Admin-only, and deliberately not filtered by user: this is one budget for the
   * whole deployment, so a per-user view of it would be actively misleading. The
   * response separates the provider's own balance from ISOBASH's ledger, because
   * they disagree whenever anything was rendered outside ISOBASH, and only the
   * provider's number is the authority on what can still be spent.
   */
  @Get('video-credits')
  getVideoCredits() {
    return this.credits.summary('magic-hour');
  }

  @HttpCode(200)
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 10, windowMs: 60_000 })
  @Post('shell/exec')
  async executeShell(@Body() body: { command?: string }) {
    if (typeof body?.command !== 'string') {
      return {
        ok: false,
        blocked: true,
        command: '',
        stdout: '',
        stderr: 'A command string is required.',
        exitCode: 1,
      };
    }

    return this.shell.execute(body.command);
  }

  /** `directory`, not `users`: `/admin/users` is a frontend page route, and the
   gateway rewrite would let the page shadow this handler. See the note on
   `@Get('configuration')` above and `scripts/check-route-collisions.mjs`. */
  @Get('directory')
  listUsers(@Query() query: ListUsersQueryDto) {
    return this.users.list(query);
  }

  @Get('users/:id')
  getUser(@Param('id', ParseIntPipe) id: number) {
    return this.users.get(id);
  }

  @Patch('users/:id/role')
  updateRole(
    @CurrentUser() actor: SessionUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() input: UpdateUserRoleDto,
  ) {
    return this.users.updateRole(actor, id, input);
  }

  /**
   * Phase 16/17: grant or withdraw a plan. This is the only path to a plan above
   * Free, because there is no payment processor: an entitlement that appeared on
   * its own would be a claim ISOBASH cannot keep. Audited in the service.
   */
  @Patch('users/:id/plan')
  updatePlan(
    @CurrentUser() actor: SessionUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() input: ChangePlanDto,
  ) {
    return this.billing.grantPlan(actor, id, input.plan, input.note);
  }

  @HttpCode(200)
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 30, windowMs: 15 * 60 * 1000 })
  @Post('users/:id/revoke-sessions')
  revokeSessions(
    @CurrentUser() actor: SessionUser,
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    // Recorded here as well as in the service so the operator's IP is captured.
    void this.audit.log({
      category: 'ADMIN',
      action: 'admin.user.sessions_revoke_requested',
      actorId: actor.id,
      actorEmail: actor.email,
      ...this.audit.fromRequest(req),
      metadata: { targetUserId: id },
    });
    return this.users.revokeSessions(actor, id);
  }
}
