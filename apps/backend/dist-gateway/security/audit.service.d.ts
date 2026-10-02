import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
export type AuditCategory = 'AUTH' | 'AUTHORIZATION' | 'ADMIN' | 'SECURITY';
export type AuditInput = {
    category: AuditCategory;
    action: string;
    actorId?: number;
    actorEmail?: string;
    ip?: string;
    userAgent?: string;
    metadata?: Record<string, unknown>;
};
export declare class AuditService {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    log(input: AuditInput): Promise<void>;
    fromRequest(req: Request): Pick<AuditInput, 'ip' | 'userAgent'>;
}
