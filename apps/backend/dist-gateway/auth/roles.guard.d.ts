import { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuditService } from '../security/audit.service';
export declare class RolesGuard implements CanActivate {
    private readonly reflector;
    private readonly audit;
    private readonly logger;
    constructor(reflector: Reflector, audit: AuditService);
    canActivate(context: ExecutionContext): Promise<boolean>;
}
