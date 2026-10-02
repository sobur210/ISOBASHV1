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
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const bcryptjs_1 = require("bcryptjs");
const node_crypto_1 = require("node:crypto");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../security/audit.service");
const rate_limit_service_1 = require("../security/rate-limit.service");
const secret_cipher_1 = require("../security/secret-cipher");
const totp_1 = require("../security/totp");
const session_model_1 = require("./session.model");
const MFA_TOKEN_TTL_MS = 3 * 60 * 1000;
const MFA_TOKEN_MAX_ATTEMPTS = 20;
let AuthService = class AuthService {
    prisma;
    audit;
    rateLimit;
    cipher;
    saltRounds = 10;
    secure = process.env.NODE_ENV === 'production';
    pendingMfa = new Map();
    loginFailures;
    constructor(prisma, audit, rateLimit, cipher) {
        this.prisma = prisma;
        this.audit = audit;
        this.rateLimit = rateLimit;
        this.cipher = cipher;
        this.loginFailures = { limit: 5, windowMs: 15 * 60 * 1000 };
    }
    sanitize(user) {
        return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            mfaEnabled: Boolean(user.mfaEnabledAt),
            createdAt: user.createdAt.toISOString(),
        };
    }
    async register(dto, ip, userAgent) {
        const email = dto.email.toLowerCase();
        const passwordHash = await (0, bcryptjs_1.hash)(dto.password, this.saltRounds);
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
        }
        catch (error) {
            if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                throw new common_1.ConflictException('An account with this email already exists.');
            }
            throw error;
        }
    }
    async login(dto, ip, userAgent) {
        const email = dto.email.toLowerCase();
        const user = await this.prisma.user.findUnique({ where: { email } });
        if (!user?.passwordHash || !(await (0, bcryptjs_1.compare)(dto.password, user.passwordHash))) {
            await this.recordLoginFailure(email, ip, userAgent);
            throw new common_1.UnauthorizedException('Invalid email or password.');
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
    async completeMfaLogin(token, code, ip, userAgent) {
        const pending = this.pendingMfa.get(token);
        if (!pending || pending.expiresAt <= Date.now()) {
            this.pendingMfa.delete(token);
            throw new common_1.UnauthorizedException('This sign-in request has expired. Please sign in again.');
        }
        if (pending.attempts >= MFA_TOKEN_MAX_ATTEMPTS) {
            this.pendingMfa.delete(token);
            throw new common_1.UnauthorizedException('Too many attempts. Please sign in again.');
        }
        const user = await this.prisma.user.findUnique({ where: { id: pending.userId } });
        if (!user?.mfaSecret || !user.mfaEnabledAt) {
            this.pendingMfa.delete(token);
            throw new common_1.UnauthorizedException('Multi-factor authentication is not enabled for this account.');
        }
        const secret = this.cipher.decrypt(user.mfaSecret);
        if (!(0, totp_1.verifyTotp)(secret, code)) {
            pending.attempts += 1;
            await this.audit.log({
                category: 'SECURITY',
                action: 'mfa_login_failed',
                actorId: user.id,
                actorEmail: user.email,
                ip,
                userAgent,
            });
            throw new common_1.UnauthorizedException('Invalid authenticator code.');
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
    async setupMfa(user, password, ip, userAgent) {
        const row = await this.prisma.user.findUnique({ where: { id: user.id } });
        if (!row?.passwordHash || !(await (0, bcryptjs_1.compare)(password, row.passwordHash))) {
            await this.audit.log({
                category: 'SECURITY',
                action: 'mfa_setup_failed_wrong_password',
                actorId: user.id,
                actorEmail: user.email,
                ip,
                userAgent,
            });
            throw new common_1.UnauthorizedException('Password is incorrect.');
        }
        const secret = (0, totp_1.generateTotpSecret)();
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
        return { secret, otpauthUrl: (0, totp_1.otpauthUrl)(secret, row.email) };
    }
    async enableMfa(user, code, sessionId, ip, userAgent) {
        const row = await this.prisma.user.findUnique({ where: { id: user.id } });
        if (!row?.mfaSecret) {
            throw new common_1.BadRequestException('Start MFA setup first to receive a secret.');
        }
        if (row.mfaEnabledAt) {
            throw new common_1.BadRequestException('Multi-factor authentication is already enabled.');
        }
        const secret = this.cipher.decrypt(row.mfaSecret);
        if (!(0, totp_1.verifyTotp)(secret, code)) {
            await this.audit.log({
                category: 'SECURITY',
                action: 'mfa_enable_failed_invalid_code',
                actorId: user.id,
                actorEmail: user.email,
                ip,
                userAgent,
            });
            throw new common_1.UnauthorizedException('Invalid authenticator code.');
        }
        await this.prisma.user.update({ where: { id: user.id }, data: { mfaEnabledAt: new Date() } });
        // Rotate every other session: each device must re-authenticate after enabling MFA.
        await this.prisma.session.updateMany({
            where: sessionId === undefined
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
    async disableMfa(user, code, ip, userAgent) {
        const row = await this.prisma.user.findUnique({ where: { id: user.id } });
        if (!row?.mfaEnabledAt) {
            throw new common_1.BadRequestException('Multi-factor authentication is not enabled.');
        }
        if (!row.mfaSecret || !(0, totp_1.verifyTotp)(this.cipher.decrypt(row.mfaSecret), code)) {
            await this.audit.log({
                category: 'SECURITY',
                action: 'mfa_disable_failed_invalid_code',
                actorId: user.id,
                actorEmail: user.email,
                ip,
                userAgent,
            });
            throw new common_1.UnauthorizedException('Invalid authenticator code.');
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
    startMfaSession(userId) {
        const token = (0, node_crypto_1.randomBytes)(24).toString('hex');
        this.pendingMfa.set(token, { userId, attempts: 0, expiresAt: Date.now() + MFA_TOKEN_TTL_MS });
        return token;
    }
    purgePendingMfaForUser(userId) {
        for (const [token, pending] of this.pendingMfa) {
            if (pending.userId === userId) {
                this.pendingMfa.delete(token);
            }
        }
    }
    async recordLoginFailure(email, ip, userAgent) {
        const result = await this.rateLimit.hit(`login-failures:${email}`, this.loginFailures.limit, this.loginFailures.windowMs);
        const emailHash = (0, node_crypto_1.createHash)('sha256').update(email).digest('hex').slice(0, 16);
        await this.audit.log({
            category: 'SECURITY',
            action: 'login_failed',
            actorEmail: email,
            ip,
            userAgent,
            metadata: { emailPart: emailHash, locked: !result.allowed },
        });
        if (!result.allowed) {
            throw new common_1.HttpException('Too many failed sign-in attempts for this account. Please retry later.', common_1.HttpStatus.TOO_MANY_REQUESTS);
        }
    }
    async createSession(userId) {
        return this.prisma.session.create({
            data: { id: (0, node_crypto_1.randomUUID)(), userId, expiresAt: new Date(Date.now() + session_model_1.SESSION_TTL_MS) },
        });
    }
    async sessionUser(sessionId) {
        const user = await this.resolveUser(sessionId);
        return { user };
    }
    async resolveUser(sessionId) {
        if (!sessionId)
            return null;
        const session = await this.prisma.session.findUnique({
            where: { id: sessionId },
            include: { user: true },
        });
        if (!session || session.revokedAt !== null || session.expiresAt.getTime() <= Date.now()) {
            return null;
        }
        return this.sanitize(session.user);
    }
    async requireUser(sessionId) {
        const user = await this.resolveUser(sessionId);
        if (!user) {
            throw new common_1.UnauthorizedException('Authentication required.');
        }
        return user;
    }
    async revoke(sessionId) {
        if (!sessionId)
            return;
        await this.prisma.session.updateMany({
            where: { id: sessionId, revokedAt: null },
            data: { revokedAt: new Date() },
        });
    }
    setAuthCookie(res, sessionId) {
        res.cookie(session_model_1.AUTH_COOKIE_NAME, sessionId, {
            httpOnly: true,
            sameSite: 'lax',
            secure: this.secure,
            path: '/',
            maxAge: session_model_1.SESSION_TTL_MS,
        });
    }
    clearAuthCookie(res) {
        res.clearCookie(session_model_1.AUTH_COOKIE_NAME, {
            httpOnly: true,
            sameSite: 'lax',
            secure: this.secure,
            path: '/',
        });
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_service_1.AuditService,
        rate_limit_service_1.RateLimitService,
        secret_cipher_1.SecretCipher])
], AuthService);
//# sourceMappingURL=auth.service.js.map