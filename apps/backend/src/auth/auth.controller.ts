import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { AUTH_COOKIE_NAME } from './session.model';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  async register(@Res({ passthrough: true }) res: Response, @Body() dto: RegisterDto) {
    const { user, session } = await this.auth.register(dto);
    this.auth.setAuthCookie(res, session.id);
    return { user };
  }

  @Post('login')
  async login(@Res({ passthrough: true }) res: Response, @Body() dto: LoginDto) {
    const { user, session } = await this.auth.login(dto);
    this.auth.setAuthCookie(res, session.id);
    return { user };
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const sessionId = req.cookies?.[AUTH_COOKIE_NAME] as string | undefined;
    await this.auth.revoke(sessionId);
    this.auth.clearAuthCookie(res);
    return { ok: true };
  }

  @Get('me')
  async me(@Req() req: Request) {
    const sessionId = req.cookies?.[AUTH_COOKIE_NAME] as string | undefined;
    return this.auth.sessionUser(sessionId);
  }
}