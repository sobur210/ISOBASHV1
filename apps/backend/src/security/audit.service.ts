import { Injectable, Logger } from '@nestjs/common';
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

@Injectable()
export class AuditService {
  private readonly logger = new Logger('Audit');

  constructor(private readonly prisma: PrismaService) {}

  async log(input: AuditInput): Promise<void> {
    try {
      await this.prisma.auditEvent.create({
        data: {
          category: input.category,
          action: input.action,
          actorId: input.actorId ?? null,
          actorEmail: input.actorEmail ?? null,
          ip: input.ip ?? null,
          userAgent: input.userAgent ?? null,
          metadata: input.metadata ? (input.metadata as object) : undefined,
        },
      });
    } catch (error) {
      this.logger.warn(`Audit write failed for ${input.action}: ${error instanceof Error ? error.message : error}`);
    }
  }

  fromRequest(req: Request): Pick<AuditInput, 'ip' | 'userAgent'> {
    const forwarded = req.headers['x-forwarded-for'];
    const ip =
      (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim() || req.ip || 'unknown';
    const userAgent = (req.headers['user-agent'] as string | undefined)?.slice(0, 500);
    return { ip, userAgent: userAgent || undefined };
  }
}