import { Request, Response } from 'express';
import { AuditService } from '../security/audit.service';
import { AuthService } from './auth.service';
import { SessionUser } from './session.model';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { MfaCodeDto } from './dto/mfa-code.dto';
import { MfaSetupDto } from './dto/mfa-setup.dto';
import { MfaVerifyDto } from './dto/mfa-verify.dto';
export declare class AuthController {
    private readonly auth;
    private readonly audit;
    constructor(auth: AuthService, audit: AuditService);
    private context;
    register(res: Response, req: Request, dto: RegisterDto): Promise<{
        user: SessionUser;
    }>;
    login(res: Response, req: Request, dto: LoginDto): Promise<{
        mfaRequired: boolean;
        mfaToken: string;
        user?: undefined;
    } | {
        user: SessionUser;
        mfaRequired?: undefined;
        mfaToken?: undefined;
    }>;
    verifyMfa(res: Response, req: Request, dto: MfaVerifyDto): Promise<{
        user: SessionUser;
    }>;
    logout(req: Request, res: Response): Promise<{
        ok: boolean;
    }>;
    me(req: Request): Promise<{
        user: SessionUser;
    } | {
        user: null;
    }>;
    setupMfa(req: Request, user: SessionUser, dto: MfaSetupDto): Promise<{
        secret: string;
        otpauthUrl: string;
    }>;
    enableMfa(req: Request, user: SessionUser, dto: MfaCodeDto): Promise<{
        ok: boolean;
    }>;
    disableMfa(req: Request, user: SessionUser, dto: MfaCodeDto): Promise<{
        ok: boolean;
    }>;
}
