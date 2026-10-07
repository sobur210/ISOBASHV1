import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { compare, hash } from 'bcryptjs';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../security/audit.service';
import { RateLimitService } from '../security/rate-limit.service';
import { SecretCipher } from '../security/secret-cipher';
import { generateTotpSecret, otpauthUrl, verifyTotp } from '../security/totp';
import { parseSameSite } from '../shared/config/configuration';
import { AUTH_COOKIE_NAME, AuthSession, SESSION_TTL_MS, SessionUser } from './session.model';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

const MFA_TOKEN_TTL_MS = 3 * 60 * 1000;
const MFA_TOKEN_MAX_ATTEMPTS = 20;

type PendingMfa = { userId: number; attempts: number; expiresAt: number };

@Injectable()
export class AuthService {
  private readonly saltRounds = 10;
  /**
   * From the environment, not from NODE_ENV. The two are not the same question:
   * NODE_ENV says the code is a production build, while the cookie flags have to
   * match whether the browser is actually talking to the API cross-origin. On
   * Render the web service and the API are separate `*.onrender.com` hosts, so
   * the session needs `SameSite=None; Secure` even though NODE_ENV is
   * `production` — and `lax` (the NODE_ENV-derived default) is dropped by the
   * browser there. Read once at construction, same as the old `secure` field.
   */
  private readonly cookieSameSite = parseSameSite(process.env.COOKIE_SAMESITE);
  private readonly cookieSecure =
    process.env.COOKIE_SECURE === undefined || process.env.COOKIE_SECURE === ''
      ? process.env.NODE_ENV === 'production'
      : process.env.COOKIE_SECURE === 'true';
  private readonly pendingMfa = new Map<string, PendingMfa>();
  private readonly loginFailures: { limit: number; windowMs: number };

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly rateLimit: RateLimitService,
    private readonly cipher: SecretCipher,
  ) {
    this.loginFailures = { limit: 5, windowMs: 15 * 60 * 1000 };
  }

  sanitize(user: {
    id: number;
    email: string;
    name: string | null;
    role: 'ADMIN' | 'USER';
    mfaEnabledAt: Date | null;
    createdAt: Date;
  }): SessionUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      mfaEnabled: Boolean(user.mfaEnabledAt),
      createdAt: user.createdAt.toISOString(),
    };
  }

  async register(dto: RegisterDto, ip?: string, userAgent?: string): Promise<{ user: SessionUser; session: AuthSession }> {
    const email = dto.email.toLowerCase();
    const passwordHash = await hash(dto.password, this.saltRounds);
    try {
      // Bootstrap rule: the first account on an empty database becomes ADMIN so the
      // admin surface is reachable. Every later account defaults to USER.
      const isFirstUser = (await this.prisma.user.count()) === 0;
      const user = await this.prisma.user.create({
        data: {
          email,
          name: dto.name?.trim() || null,
          passwordHash,
          role: isFirstUser ? 'ADMIN' : 'USER',
        },
      });
      await this.audit.log({
        category: 'AUTH',
        action: 'register',
        actorId: user.id,
        actorEmail: user.email,
        ip,
        userAgent,
        metadata: { isFirstUser, role: user.role },
      });
      const session = await this.createSession(user.id);
      return { user: this.sanitize(user), session };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('An account with this email already exists.');
      }
      throw error;
    }
  }

  async login(
    dto: LoginDto,
    ip?: string,
    userAgent?: string,
  ): Promise<{ kind: 'session'; user: SessionUser; session: AuthSession } | { kind: 'mfa'; mfaToken: string }> {
    const email = dto.email.toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user?.passwordHash || !(await compare(dto.password, user.passwordHash))) {
      await this.recordLoginFailure(email, ip, userAgent);
      throw new UnauthorizedException('Invalid email or password.');
    }
    if (user.mfaEnabledAt) {
      const mfaToken = this.startMfaSession(user.id);
      await this.audit.log({
        category: 'AUTH',
        action: 'login_password_ok_mfa_required',
        actorId: user.id,
        actorEmail: user.email,
        ip,
        userAgent,
      });
      return { kind: 'mfa', mfaToken };
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.audit.log({
      category: 'AUTH',
      action: 'login',
      actorId: user.id,
      actorEmail: user.email,
      ip,
      userAgent,
    });
    const session = await this.createSession(user.id);
    return { kind: 'session', user: this.sanitize(user), session };
  }

  async completeMfaLogin(token: string, code: string, ip?: string, userAgent?: string) {
    const pending = this.pendingMfa.get(token);
    if (!pending || pending.expiresAt <= Date.now()) {
      this.pendingMfa.delete(token);
      throw new UnauthorizedException('This sign-in request has expired. Please sign in again.');
    }
    if (pending.attempts >= MFA_TOKEN_MAX_ATTEMPTS) {
      this.pendingMfa.delete(token);
      throw new UnauthorizedException('Too many attempts. Please sign in again.');
    }
    const user = await this.prisma.user.findUnique({ where: { id: pending.userId } });
    if (!user?.mfaSecret || !user.mfaEnabledAt) {
      this.pendingMfa.delete(token);
      throw new UnauthorizedException('Multi-factor authentication is not enabled for this account.');
    }
    const secret = this.cipher.decrypt(user.mfaSecret);
    if (!verifyTotp(secret, code)) {
      pending.attempts += 1;
      await this.audit.log({
        category: 'SECURITY',
        action: 'mfa_login_failed',
        actorId: user.id,
        actorEmail: user.email,
        ip,
        userAgent,
      });
      throw new UnauthorizedException('Invalid authenticator code.');
    }
    this.pendingMfa.delete(token);
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.audit.log({
      category: 'AUTH',
      action: 'login',
      actorId: user.id,
      actorEmail: user.email,
      ip,
      userAgent,
      metadata: { mfa: true },
    });
    const session = await this.createSession(user.id);
    return { user: this.sanitize(user), session };
  }

  async setupMfa(user: SessionUser, password: string, ip?: string, userAgent?: string) {
    const row = await this.prisma.user.findUnique({ where: { id: user.id } });
    if (!row?.passwordHash || !(await compare(password, row.passwordHash))) {
      await this.audit.log({
        category: 'SECURITY',
        action: 'mfa_setup_failed_wrong_password',
        actorId: user.id,
        actorEmail: user.email,
        ip,
        userAgent,
      });
      throw new UnauthorizedException('Password is incorrect.');
    }
    const secret = generateTotpSecret();
    await this.prisma.user.update({
      where: { id: user.id },
      data: { mfaSecret: this.cipher.encrypt(secret), mfaEnabledAt: null },
    });
    await this.audit.log({
      category: 'SECURITY',
      action: 'mfa_secret_regenerated',
      actorId: user.id,
      actorEmail: user.email,
      ip,
      userAgent,
    });
    return { secret, otpauthUrl: otpauthUrl(secret, row.email) };
  }

  async enableMfa(user: SessionUser, code: string, sessionId?: string, ip?: string, userAgent?: string) {
    const row = await this.prisma.user.findUnique({ where: { id: user.id } });
    if (!row?.mfaSecret) {
      throw new BadRequestException('Start MFA setup first to receive a secret.');
    }
    if (row.mfaEnabledAt) {
      throw new BadRequestException('Multi-factor authentication is already enabled.');
    }
    const secret = this.cipher.decrypt(row.mfaSecret);
    if (!verifyTotp(secret, code)) {
      await this.audit.log({
        category: 'SECURITY',
        action: 'mfa_enable_failed_invalid_code',
        actorId: user.id,
        actorEmail: user.email,
        ip,
        userAgent,
      });
      throw new UnauthorizedException('Invalid authenticator code.');
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { mfaEnabledAt: new Date() } });
    // Rotate every other session: each device must re-authenticate after enabling MFA.
    await this.prisma.session.updateMany({
      where:
        sessionId === undefined
          ? { userId: user.id, revokedAt: null }
          : { userId: user.id, revokedAt: null, NOT: { id: sessionId } },
      data: { revokedAt: new Date() },
    });
    await this.audit.log({
      category: 'SECURITY',
      action: 'mfa_enabled',
      actorId: user.id,
      actorEmail: user.email,
      ip,
      userAgent,
    });
    this.purgePendingMfaForUser(user.id);
    return { ok: true };
  }

  async disableMfa(user: SessionUser, code: string, ip?: string, userAgent?: string) {
    const row = await this.prisma.user.findUnique({ where: { id: user.id } });
    if (!row?.mfaEnabledAt) {
      throw new BadRequestException('Multi-factor authentication is not enabled.');
    }
    if (!row.mfaSecret || !verifyTotp(this.cipher.decrypt(row.mfaSecret), code)) {
      await this.audit.log({
        category: 'SECURITY',
        action: 'mfa_disable_failed_invalid_code',
        actorId: user.id,
        actorEmail: user.email,
        ip,
        userAgent,
      });
      throw new UnauthorizedException('Invalid authenticator code.');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { mfaSecret: null, mfaEnabledAt: null },
    });
    await this.audit.log({
      category: 'SECURITY',
      action: 'mfa_disabled',
      actorId: user.id,
      actorEmail: user.email,
      ip,
      userAgent,
    });
    return { ok: true };
  }

  private startMfaSession(userId: number): string {
    const token = randomBytes(24).toString('hex');
    this.pendingMfa.set(token, { userId, attempts: 0, expiresAt: Date.now() + MFA_TOKEN_TTL_MS });
    return token;
  }

  private purgePendingMfaForUser(userId: number) {
    for (const [token, pending] of this.pendingMfa) {
      if (pending.userId === userId) {
        this.pendingMfa.delete(token);
      }
    }
  }

  private async recordLoginFailure(email: string, ip?: string, userAgent?: string) {
    const result = await this.rateLimit.hit(`login-failures:${email}`, this.loginFailures.limit, this.loginFailures.windowMs);
    const emailHash = createHash('sha256').update(email).digest('hex').slice(0, 16);
    await this.audit.log({
      category: 'SECURITY',
      action: 'login_failed',
      actorEmail: email,
      ip,
      userAgent,
      metadata: { emailPart: emailHash, locked: !result.allowed },
    });
    if (!result.allowed) {
      throw new HttpException(
        'Too many failed sign-in attempts for this account. Please retry later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  async createSession(userId: number): Promise<AuthSession> {
    return this.prisma.session.create({
      data: { id: randomUUID(), userId, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
    });
  }

  async sessionUser(sessionId?: string): Promise<{ user: SessionUser } | { user: null }> {
    const user = await this.resolveUser(sessionId);
    return { user };
  }

  async resolveUser(sessionId?: string): Promise<SessionUser | null> {
    if (!sessionId) return null;
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { user: true },
    });
    if (!session || session.revokedAt !== null || session.expiresAt.getTime() <= Date.now()) {
      return null;
    }
    return this.sanitize(session.user);
  }

  async requireUser(sessionId?: string): Promise<SessionUser> {
    const user = await this.resolveUser(sessionId);
    if (!user) {
      throw new UnauthorizedException('Authentication required.');
    }
    return user;
  }

  async revoke(sessionId?: string) {
    if (!sessionId) return;
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  setAuthCookie(res: Response, sessionId: string) {
    res.cookie(AUTH_COOKIE_NAME, sessionId, {
      httpOnly: true,
      sameSite: this.cookieSameSite,
      secure: this.cookieSecure,
      path: '/',
      maxAge: SESSION_TTL_MS,
    });
  }

  clearAuthCookie(res: Response) {
    res.clearCookie(AUTH_COOKIE_NAME, {
      httpOnly: true,
      sameSite: this.cookieSameSite,
      secure: this.cookieSecure,
      path: '/',
    });
  }
}