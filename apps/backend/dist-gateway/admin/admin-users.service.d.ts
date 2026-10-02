import { PrismaService } from '../prisma/prisma.service';
import { SessionUser } from '../auth/session.model';
import { AuditService } from '../security/audit.service';
import { ListUsersQueryDto, UpdateUserRoleDto } from './dto/admin-user.dto';
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
export declare class AdminUsersService {
    private readonly prisma;
    private readonly audit;
    constructor(prisma: PrismaService, audit: AuditService);
    private activeSessionCounts;
    private toSummary;
    list(query: ListUsersQueryDto): Promise<{
        users: AdminUserSummary[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    }>;
    get(id: number): Promise<AdminUserSummary>;
    /**
     * Role changes are the one place where a mistake locks everyone out, so the
     * two unrecoverable cases are refused server-side rather than trusted to the
     * caller: an admin may not change their own role, and the last remaining admin
     * may not be demoted.
     */
    updateRole(actor: SessionUser, id: number, input: UpdateUserRoleDto): Promise<{
        revokedSessions: number;
        id: number;
        email: string;
        name: string | null;
        role: "ADMIN" | "USER";
        mfaEnabled: boolean;
        createdAt: string;
        lastLoginAt: string | null;
        activeSessions: number;
    }>;
    revokeSessions(actor: SessionUser, id: number): Promise<{
        revokedSessions: number;
    }>;
}
