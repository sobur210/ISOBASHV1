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
  ) {}

  @Get('system-health')
  getSystemHealth() {
    return this.systemHealth.checkAll();
  }

  @Get('users')
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
