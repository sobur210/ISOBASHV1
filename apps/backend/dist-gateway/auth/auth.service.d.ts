import { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../security/audit.service';
import { RateLimitService } from '../security/rate-limit.service';
import { SecretCipher } from '../security/secret-cipher';
import { AuthSession, SessionUser } from './session.model';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
export declare class AuthService {
    private readonly prisma;
    private readonly audit;
    private readonly rateLimit;
    private readonly cipher;
    private readonly saltRounds;
    private readonly secure;
    private readonly pendingMfa;
    private readonly loginFailures;
    constructor(prisma: PrismaService, audit: AuditService, rateLimit: RateLimitService, cipher: SecretCipher);
    sanitize(user: {
        id: number;
        email: string;
        name: string | null;
        role: 'ADMIN' | 'USER';
        mfaEnabledAt: Date | null;
        createdAt: Date;
    }): SessionUser;
    register(dto: RegisterDto, ip?: string, userAgent?: string): Promise<{
        user: SessionUser;
        session: AuthSession;
    }>;
    login(dto: LoginDto, ip?: string, userAgent?: string): Promise<{
        kind: 'session';
        user: SessionUser;
        session: AuthSession;
    } | {
        kind: 'mfa';
        mfaToken: string;
    }>;
    completeMfaLogin(token: string, code: string, ip?: string, userAgent?: string): Promise<{
        user: SessionUser;
        session: AuthSession;
    }>;
    setupMfa(user: SessionUser, password: string, ip?: string, userAgent?: string): Promise<{
        secret: string;
        otpauthUrl: string;
    }>;
    enableMfa(user: SessionUser, code: string, sessionId?: string, ip?: string, userAgent?: string): Promise<{
        ok: boolean;
    }>;
    disableMfa(user: SessionUser, code: string, ip?: string, userAgent?: string): Promise<{
        ok: boolean;
    }>;
    private startMfaSession;
    private purgePendingMfaForUser;
    private recordLoginFailure;
    createSession(userId: number): Promise<AuthSession>;
    sessionUser(sessionId?: string): Promise<{
        user: SessionUser;
    } | {
        user: null;
    }>;
    resolveUser(sessionId?: string): Promise<SessionUser | null>;
    requireUser(sessionId?: string): Promise<SessionUser>;
    revoke(sessionId?: string): Promise<void>;
    setAuthCookie(res: Response, sessionId: string): void;
    clearAuthCookie(res: Response): void;
}
