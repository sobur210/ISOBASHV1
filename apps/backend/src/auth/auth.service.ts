import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { compare, hash } from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AUTH_COOKIE_NAME, AuthSession, SESSION_TTL_MS, SessionUser } from './session.model';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  private readonly saltRounds = 10;
  private readonly secure = process.env.NODE_ENV === 'production';

  constructor(private readonly prisma: PrismaService) {}

  sanitize(user: {
    id: number;
    email: string;
    name: string | null;
    role: 'ADMIN' | 'USER';
    createdAt: Date;
  }): SessionUser {
    return { id: user.id, email: user.email, name: user.name, role: user.role, createdAt: user.createdAt.toISOString() };
  }

  async register(dto: RegisterDto): Promise<{ user: SessionUser; session: AuthSession }> {
    const passwordHash = await hash(dto.password, this.saltRounds);
    try {
      // Bootstrap rule: the first account on an empty database becomes ADMIN so the
      // admin surface is reachable. Every later account defaults to USER.
      const isFirstUser = (await this.prisma.user.count()) === 0;
      const user = await this.prisma.user.create({
        data: {
          email: dto.email.toLowerCase(),
          name: dto.name?.trim() || null,
          passwordHash,
          role: isFirstUser ? 'ADMIN' : 'USER',
        },
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

  async login(dto: LoginDto): Promise<{ user: SessionUser; session: AuthSession }> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (!user?.passwordHash) {
      throw new UnauthorizedException('Invalid email or password.');
    }
    const valid = await compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password.');
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const session = await this.createSession(user.id);
    return { user: this.sanitize(user), session };
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
      sameSite: 'lax',
      secure: this.secure,
      path: '/',
      maxAge: SESSION_TTL_MS,
    });
  }

  clearAuthCookie(res: Response) {
    res.clearCookie(AUTH_COOKIE_NAME, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.secure,
      path: '/',
    });
  }
}