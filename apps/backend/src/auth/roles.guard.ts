import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { SessionUser } from './session.model';
import { ROLES_KEY } from './roles.decorator';
import { AuditService } from '../security/audit.service';

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger('RolesGuard');

  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<SessionUser['role'][]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }
    const request = context.switchToHttp().getRequest<Request & { user?: SessionUser }>();
    const user = request.user;
    const contextInfo = this.audit.fromRequest(request);
    if (!user || !requiredRoles.includes(user.role)) {
      this.logger.warn(`Role guard denied ${request.method} ${request.url} for role ${user?.role ?? 'none'}`);
      await this.audit.log({
        category: 'AUTHORIZATION',
        action: 'forbidden',
        actorId: user?.id,
        actorEmail: user?.email,
        ip: contextInfo.ip,
        userAgent: contextInfo.userAgent,
        metadata: { method: request.method, path: request.url, requiredRoles },
      });
      throw new ForbiddenException('You do not have permission to access this resource.');
    }
    await this.audit.log({
      category: 'ADMIN',
      action: 'admin_access',
      actorId: user.id,
      actorEmail: user.email,
      ip: contextInfo.ip,
      userAgent: contextInfo.userAgent,
      metadata: { method: request.method, path: request.url },
    });
    return true;
  }
}