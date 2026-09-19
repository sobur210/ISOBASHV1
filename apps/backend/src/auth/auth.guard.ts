import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { AUTH_COOKIE_NAME } from './session.model';
import { AuthService } from './auth.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const sessionId = request.cookies?.[AUTH_COOKIE_NAME] as string | undefined;
    const user = await this.auth.requireUser(sessionId);
    (request as Request & { user?: unknown }).user = user;
    return true;
  }
}