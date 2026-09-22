import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { AUTH_COOKIE_NAME, SessionUser } from './session.model';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const sessionId = request.cookies?.[AUTH_COOKIE_NAME] as string | undefined;
    const user = await this.auth.requireUser(sessionId);
    if (user.role !== 'ADMIN') {
      throw new ForbiddenException('Admin access required.');
    }
    (request as Request & { user?: SessionUser }).user = user;
    return true;
  }
}