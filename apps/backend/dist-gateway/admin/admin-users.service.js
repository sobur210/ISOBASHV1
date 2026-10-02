"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminUsersService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../security/audit.service");
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
};
let AdminUsersService = class AdminUsersService {
    prisma;
    audit;
    constructor(prisma, audit) {
        this.prisma = prisma;
        this.audit = audit;
    }
    activeSessionCounts(userIds) {
        if (userIds.length === 0)
            return Promise.resolve(new Map());
        return this.prisma.session
            .groupBy({
            by: ['userId'],
            where: { userId: { in: userIds }, revokedAt: null, expiresAt: { gt: new Date() } },
            _count: { _all: true },
        })
            .then((rows) => new Map(rows.map((row) => [row.userId, row._count._all])));
    }
    toSummary(user, activeSessions) {
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
    async list(query) {
        const page = query.page ?? 1;
        const pageSize = query.pageSize ?? 25;
        const search = query.q?.trim();
        const where = {
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
    async get(id) {
        const user = await this.prisma.user.findUnique({ where: { id }, select: USER_SELECT });
        if (!user) {
            throw new common_1.NotFoundException('User not found.');
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
    async updateRole(actor, id, input) {
        if (actor.id === id) {
            throw new common_1.BadRequestException('You cannot change your own role.');
        }
        const target = await this.prisma.user.findUnique({ where: { id }, select: USER_SELECT });
        if (!target) {
            throw new common_1.NotFoundException('User not found.');
        }
        if (target.role === input.role) {
            const unchanged = await this.activeSessionCounts([id]);
            return { ...this.toSummary(target, unchanged.get(id) ?? 0), revokedSessions: 0 };
        }
        if (target.role === 'ADMIN' && input.role === 'USER') {
            const admins = await this.prisma.user.count({ where: { role: 'ADMIN' } });
            if (admins <= 1) {
                throw new common_1.BadRequestException('This is the last administrator; promote another admin first.');
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
    async revokeSessions(actor, id) {
        if (actor.id === id) {
            throw new common_1.BadRequestException('You cannot revoke your own sessions here; sign out instead.');
        }
        const target = await this.prisma.user.findUnique({ where: { id }, select: USER_SELECT });
        if (!target) {
            throw new common_1.NotFoundException('User not found.');
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
};
exports.AdminUsersService = AdminUsersService;
exports.AdminUsersService = AdminUsersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_service_1.AuditService])
], AdminUsersService);
//# sourceMappingURL=admin-users.service.js.map