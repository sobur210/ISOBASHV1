import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SessionUser } from '../auth/session.model';
import { AuditService } from '../security/audit.service';
import { ListUsersQueryDto, UpdateUserRoleDto } from './dto/admin-user.dto';

/**
 * Never expose credential material. `passwordHash` and `mfaSecret` are omitted
 * by an explicit select rather than deleted afterwards, so a future column added
 * to the model cannot leak by default.
 */
const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  mfaEnabledAt: true,
  createdAt: true,
  lastLoginAt: true,
} satisfies Prisma.UserSelect;

export type AdminUserSummary = {
  id: number;
  email: string;
  name: string | null;
  role: 'ADMIN' | 'USER';
  mfaEnabled: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  activeSessions: number;
};

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private activeSessionCounts(userIds: number[]): Promise<Map<number, number>> {
    if (userIds.length === 0) return Promise.resolve(new Map());
    return this.prisma.session
      .groupBy({
        by: ['userId'],
        where: { userId: { in: userIds }, revokedAt: null, expiresAt: { gt: new Date() } },
        _count: { _all: true },
      })
      .then((rows) => new Map(rows.map((row) => [row.userId, row._count._all])));
  }

  private toSummary(
    user: {
      id: number;
      email: string;
      name: string | null;
      role: 'ADMIN' | 'USER';
      mfaEnabledAt: Date | null;
      createdAt: Date;
      lastLoginAt: Date | null;
    },
    activeSessions: number,
  ): AdminUserSummary {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      mfaEnabled: user.mfaEnabledAt !== null,
      createdAt: user.createdAt.toISOString(),
      lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
      activeSessions,
    };
  }

  async list(query: ListUsersQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const search = query.q?.trim();

    const where: Prisma.UserWhereInput = {
      ...(query.role ? { role: query.role } : {}),
      ...(search
        ? {
            OR: [
              { email: { contains: search, mode: 'insensitive' } },
              { name: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: USER_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    const counts = await this.activeSessionCounts(users.map((user) => user.id));

    return {
      users: users.map((user) => this.toSummary(user, counts.get(user.id) ?? 0)),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async get(id: number) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: USER_SELECT });
    if (!user) {
      throw new NotFoundException('User not found.');
    }
    const counts = await this.activeSessionCounts([user.id]);
    return this.toSummary(user, counts.get(user.id) ?? 0);
  }

  /**
   * Role changes are the one place where a mistake locks everyone out, so the
   * two unrecoverable cases are refused server-side rather than trusted to the
   * caller: an admin may not change their own role, and the last remaining admin
   * may not be demoted.
   */
  async updateRole(actor: SessionUser, id: number, input: UpdateUserRoleDto) {
    if (actor.id === id) {
      throw new BadRequestException('You cannot change your own role.');
    }

    const target = await this.prisma.user.findUnique({ where: { id }, select: USER_SELECT });
    if (!target) {
      throw new NotFoundException('User not found.');
    }
    if (target.role === input.role) {
      const unchanged = await this.activeSessionCounts([id]);
      return { ...this.toSummary(target, unchanged.get(id) ?? 0), revokedSessions: 0 };
    }

    if (target.role === 'ADMIN' && input.role === 'USER') {
      const admins = await this.prisma.user.count({ where: { role: 'ADMIN' } });
      if (admins <= 1) {
        throw new BadRequestException('This is the last administrator; promote another admin first.');
      }
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { role: input.role },
      select: USER_SELECT,
    });

    // A demotion must not leave the removed admin holding a live session: the
    // role is re-read on every request, but revoking closes it immediately.
    let revokedSessions = 0;
    if (input.role === 'USER') {
      revokedSessions = (await this.revokeSessions(actor, id)).revokedSessions;
    }

    await this.audit.log({
      category: 'ADMIN',
      action: 'admin.user.role_changed',
      actorId: actor.id,
      actorEmail: actor.email,
      metadata: { targetUserId: id, targetEmail: target.email, from: target.role, to: input.role, revokedSessions },
    });

    const counts = await this.activeSessionCounts([id]);
    return { ...this.toSummary(updated, counts.get(id) ?? 0), revokedSessions };
  }

  async revokeSessions(actor: SessionUser, id: number) {
    if (actor.id === id) {
      throw new BadRequestException('You cannot revoke your own sessions here; sign out instead.');
    }

    const target = await this.prisma.user.findUnique({ where: { id }, select: USER_SELECT });
    if (!target) {
      throw new NotFoundException('User not found.');
    }

    const { count } = await this.prisma.session.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await this.audit.log({
      category: 'ADMIN',
      action: 'admin.user.sessions_revoked',
      actorId: actor.id,
      actorEmail: actor.email,
      metadata: { targetUserId: id, targetEmail: target.email, revokedSessions: count },
    });

    return { revokedSessions: count };
  }
}
