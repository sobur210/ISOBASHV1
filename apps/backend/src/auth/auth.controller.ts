import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuditService } from '../security/audit.service';
import { RateLimit, RateLimitGuard } from '../security/rate-limit.guard';
import { AUTH_COOKIE_NAME } from './session.model';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { CurrentUser } from './current-user.decorator';
import { SessionUser } from './session.model';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { MfaCodeDto } from './dto/mfa-code.dto';
import { MfaSetupDto } from './dto/mfa-setup.dto';
import { MfaVerifyDto } from './dto/mfa-verify.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {}

  private context(req: Request) {
    return this.audit.fromRequest(req);
  }

  @Post('register')
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 30, windowMs: 15 * 60 * 1000 })
  async register(@Res({ passthrough: true }) res: Response, @Req() req: Request, @Body() dto: RegisterDto) {
    const { user, session } = await this.auth.register(dto, this.context(req).ip, this.context(req).userAgent);
    this.auth.setAuthCookie(res, session.id);
    return { user };
  }

  @Post('login')
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 30, windowMs: 15 * 60 * 1000 })
  async login(@Res({ passthrough: true }) res: Response, @Req() req: Request, @Body() dto: LoginDto) {
    if (req.cookies?.[AUTH_COOKIE_NAME]) {
      await this.auth.revoke(req.cookies[AUTH_COOKIE_NAME]);
      this.auth.clearAuthCookie(res);
    }
    const result = await this.auth.login(dto, this.context(req).ip, this.context(req).userAgent);
    if (result.kind === 'mfa') {
      return { mfaRequired: true, mfaToken: result.mfaToken };
    }
    this.auth.setAuthCookie(res, result.session.id);
    return { user: result.user };
  }

  @Post('mfa/verify')
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 10, windowMs: 15 * 60 * 1000 })
  async verifyMfa(@Res({ passthrough: true }) res: Response, @Req() req: Request, @Body() dto: MfaVerifyDto) {
    const { user, session } = await this.auth.completeMfaLogin(
      dto.token,
      dto.code,
      this.context(req).ip,
      this.context(req).userAgent,
    );
    this.auth.setAuthCookie(res, session.id);
    return { user };
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const sessionId = req.cookies?.[AUTH_COOKIE_NAME] as string | undefined;
    const session = sessionId ? await this.auth.resolveUser(sessionId) : null;
    await this.auth.revoke(sessionId);
    this.auth.clearAuthCookie(res);
    await this.audit.log({
      category: 'AUTH',
      action: 'logout',
      actorId: session?.id,
      actorEmail: session?.email,
      ...this.context(req),
    });
    return { ok: true };
  }

  @Get('me')
  async me(@Req() req: Request) {
    const sessionId = req.cookies?.[AUTH_COOKIE_NAME] as string | undefined;
    return this.auth.sessionUser(sessionId);
  }

  @Post('mfa/setup')
  @UseGuards(AuthGuard)
  async setupMfa(@Req() req: Request, @CurrentUser() user: SessionUser, @Body() dto: MfaSetupDto) {
    return this.auth.setupMfa(user, dto.password, this.context(req).ip, this.context(req).userAgent);
  }

  @Post('mfa/enable')
  @UseGuards(AuthGuard)
  async enableMfa(@Req() req: Request, @CurrentUser() user: SessionUser, @Body() dto: MfaCodeDto) {
    const sessionId = req.cookies?.[AUTH_COOKIE_NAME] as string | undefined;
    return this.auth.enableMfa(user, dto.code, sessionId, this.context(req).ip, this.context(req).userAgent);
  }

  @Post('mfa/disable')
  @UseGuards(AuthGuard)
  async disableMfa(@Req() req: Request, @CurrentUser() user: SessionUser, @Body() dto: MfaCodeDto) {
    return this.auth.disableMfa(user, dto.code, this.context(req).ip, this.context(req).userAgent);
  }
}